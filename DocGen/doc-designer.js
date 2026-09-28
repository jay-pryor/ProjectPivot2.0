// @ts-nocheck
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
   * MODULE: App.md  — MD-1: LaTeX-safe markdown primitives
   * PURPOSE: The single choke point through which every data-derived string passes
   *          on its way into a generated document, exactly as App.util.html.esc is
   *          for the HTML outputs. Emits pandoc-flavoured markdown that survives
   *          conversion to LaTeX source without hand-repair.
   * PURITY:  pure (string -> string). No DOM, no I/O, no clock.
   * DEPENDS: (none)
   * INVARIANTS: ALL data-derived text reaches a document through text(), code() or
   *             rich() — never by concatenation. Escaping happens ON THE WAY OUT;
   *             the register keeps whatever the device actually reported.
   * ============================================================================= */
  (function (App) {
    'use strict';

    /* -------------------------------------------------------------------------
     * Why escape at all, and why here.
     *
     * The captured registers are full of characters that are load-bearing in LaTeX:
     * a settings key is `wifi_sleep_policy`, a package is `com.samsung.android.app_x`,
     * a captured value can hold `$HOME`, `50%` or `a & b`. Emitted raw into markdown
     * those break twice over — markdown may read `_..._` as emphasis and eat the
     * underscores, and once the text reaches LaTeX `%` comments out the rest of the
     * line, `&` is a column separator, `$` opens math mode and `_` is a subscript.
     * The failure is silent in the first case and a compile error in the second.
     *
     * The fix belongs in the writer, not in the data. Stripping these characters at
     * input would mean the register no longer matches the device, and the
     * implementation script generated from that register would name a package that
     * does not exist. So the bytes are kept intact and escaped at the last moment.
     *
     * Two escape strategies, chosen by what the string IS:
     *   text()  backslash-escapes. For prose and free-text values.
     *   code()  wraps in a code span. For identifiers — package names, settings
     *           keys, paths, commands. Everything inside a code span is literal by
     *           definition, it survives to LaTeX as \texttt{}, and monospace is the
     *           correct typography for an identifier in a configuration report.
     * ---------------------------------------------------------------------- */

    // The user-named LaTeX-hostile set (\ { } $ & # ^ _ ~ %) UNION the characters
    // that are structural in markdown and would otherwise silently restructure the
    // document (` * [ ] | < >). Backslash is first in the class and handled first by
    // the replace, so an escaped backslash is never re-escaped.
    var HOSTILE = /[\\`*_{}\[\]<>#|$&^~%]/g;

    // Line-start-only troublemakers: these are ordinary punctuation mid-line but
    // start a list, a block quote or a setext heading in column 1.
    var LINE_START = /^(\s*)([-+=])/;
    var LINE_START_NUM = /^(\s*)(\d+)([.)])/;

    /**
     * Escape a data-derived string for use as markdown TEXT.
     *
     * Safe to hand any string, including one already containing backslashes — the
     * character class puts `\` first and the single pass never revisits its own
     * output, so text(text(s)) is double-escaped (as it should be) rather than
     * corrupt. Callers must escape exactly once.
     *
     * @param {*} s  coerced; null/undefined become ''
     * @returns {string} markdown-safe, pandoc-safe, LaTeX-safe
     */
    function text(s) {
      var str = String(s == null ? '' : s);
      if (!str) return '';
      var out = str.replace(HOSTILE, function (ch) { return '\\' + ch; });
      // Now neutralise the column-1 constructs, line by line. `#`, `>` and `|` are
      // already gone via HOSTILE; what is left is `- + =` and an ordered-list marker.
      out = out.split('\n').map(function (line) {
        return line.replace(LINE_START, '$1\\$2').replace(LINE_START_NUM, '$1$2\\$3');
      }).join('\n');
      return out;
    }

    /* -------------------------------------------------------------------------
     * The OTHER escaper, and why there has to be one.
     *
     * text() above escapes for MARKDOWN, and everything in a generated document goes
     * through it because everything in a generated document is markdown — pandoc reads
     * it and produces the LaTeX. The two escapes overlap enough to be mistaken for each
     * other (`\%`, `\&`, `\#`, `\$`, `\_` are correct in both) and they are not the same
     * escape: `\<`, `\>`, `\[`, `\|`, `\+` are ordinary markdown and are not commands
     * that LaTeX has, and `\~`, `\^`, `\.`, `\=` are accents rather than characters.
     *
     * One thing in this file does not travel as markdown: the header and footer, which
     * reach the page as `\fancyhead[C]{…}` inside `header-includes`. Pandoc passes that
     * block through VERBATIM, so nothing downstream is going to fix an escape — and a
     * header reading `<---- Security classification` compiled to `\<` and stopped the
     * build with "Undefined control sequence". Reported, and reproduced in four lines.
     *
     * So text destined for a raw-LaTeX context is escaped here instead. ONE pass, from a
     * table: several of the replacements contain braces of their own, and a second pass
     * over the output would escape those and leave `\textbackslash\{\}` on the page.
     * ---------------------------------------------------------------------- */
    var LATEX_MAP = {
      '\\': '\\textbackslash{}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}',
      '<': '\\textless{}', '>': '\\textgreater{}', '|': '\\textbar{}',
      '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#', '_': '\\_', '{': '\\{', '}': '\\}'
    };
    var LATEX_HOSTILE = /[\\~^<>|&%$#_{}]/g;

    /**
     * Escape a string for a place where LaTeX reads it directly — never for markdown.
     * @param {*} s @returns {string}
     */
    function latex(s) {
      return String(s == null ? '' : s).replace(LATEX_HOSTILE, function (ch) { return LATEX_MAP[ch]; });
    }

    /**
     * Wrap a string as a markdown code span — the right emission for an identifier.
     *
     * Content is NOT escaped: inside a code span markdown does no interpretation, so
     * escaping would put visible backslashes in the output. What the fence has to
     * survive instead is backticks in the content, which is what CommonMark's
     * variable-length fence rule is for: pick a fence longer than the longest run
     * inside, and pad with a space when the content itself starts or ends with a
     * backtick (otherwise the pad is consumed as part of the fence).
     *
     * @param {*} s @returns {string} '' for empty input (an empty code span renders as ``)
     */
    function code(s) {
      var str = String(s == null ? '' : s);
      if (!str) return '';
      // A code span cannot carry a newline; a multi-line identifier is not an
      // identifier, so fall back to escaped text rather than emit a broken span.
      if (str.indexOf('\n') !== -1) return text(str);
      var longest = 0;
      (str.match(/`+/g) || []).forEach(function (run) { longest = Math.max(longest, run.length); });
      var fence = new Array(longest + 2).join('`');
      var pad = (str.charAt(0) === '`' || str.charAt(str.length - 1) === '`') ? ' ' : '';
      return fence + pad + str + pad + fence;
    }

    /**
     * A table CELL. Same escaping as text(), but a pipe table cell cannot hold a
     * newline — the row would terminate early and the table would lose its shape.
     * Multi-line content is joined with a hard line break token the grid-table
     * writer understands; pipeTable() collapses it, gridTable() honours it.
     */
    // A sentinel standing in for "line break inside a cell" while a row is still a
    // flat string. U+0001 cannot occur in captured device output or be typed into the
    // designer, so it can never collide with real content.
    var CELL_BREAK = '\u0001';

    /* -------------------------------------------------------------------------
     * BRK-1: a long run with no space in it has to be MARKED, or it cannot wrap.
     *
     * `io.sdsasolutions.tacticalsettings` in a table cell is one word as far as the
     * typesetter is concerned, and there is no way to break it that does not have to be
     * asked for. TeX hyphenates letter sequences and a package name is not one; a
     * zero-width space is NOT a break opportunity in XeTeX (measured — a `\parbox` with
     * one and one without overflow identically); and `\raggedright` puts a word that
     * does not fit on the line anyway, out past the column edge and into its neighbour.
     *
     * So the only question is which mark, and one already in this file works: a CODE
     * SPAN reaches LaTeX as `\texttt`, and the formatting profile routes every `\texttt`
     * through `\seqsplit`, which offers a breakpoint between every character. It is
     * markdown-native, it needs no second escaping path (a code span is verbatim by
     * definition, so nothing inside it can be mis-escaped), and the width model already
     * knows a code span can break — so marking these also stops them demanding a column
     * wide enough to hold them whole, which was the other half of the problem.
     *
     * The cost is that such a run is set in monospace. For a package name, a path or a
     * settings key that is the right typography anyway, and it is what the register's
     * key column has always done.
     *
     * Deliberately narrow: 18 characters or more AND shaped like an identifier — a
     * `. _ - /` or a camelCase hump. Ordinary prose wraps at its spaces and needs no help.
     * ---------------------------------------------------------------------- */
    var IDENT_MIN = 18;
    var IDENT_RUN = /\S{18,}/g;
    var IDENT_SHAPE = /[._\/-]|[a-z][A-Z]/;

    /** Is this space-free run one that must be marked before it can break? */
    function isLongIdentifier(run) {
      return String(run).length >= IDENT_MIN && IDENT_SHAPE.test(run);
    }

    /** cell() without the line-separator conversion — the escaping half on its own, so
     *  the rich-text writer can decide for itself what a line break looks like. */
    function cellText(s) {
      var str = String(s == null ? '' : s);
      var out = '', last = 0, m;
      IDENT_RUN.lastIndex = 0;
      while ((m = IDENT_RUN.exec(str)) !== null) {
        if (!isLongIdentifier(m[0])) continue;
        // Escaped text either side, the run itself verbatim. `code()` sizes its own
        // fence, so a backtick inside the run cannot break out of it.
        out += text(str.slice(last, m.index)) + code(m[0]);
        last = m.index + m[0].length;
      }
      return out + text(str.slice(last));
    }

    function cell(s) {
      return cellText(s).split('\n').join(CELL_BREAK);
    }

    // ---- block builders ------------------------------------------------------

    /** ATX heading. `attrs` becomes a pandoc header-attribute block: `# Title {#id}`. */
    function heading(level, body, id, classes) {
      var n = Math.max(1, Math.min(6, level | 0));
      var cls = (classes || []).map(function (c) { return ' .' + c; }).join('');
      var attrs = (id ? '#' + id : '') + cls;
      return new Array(n + 1).join('#') + ' ' + body + (attrs ? ' {' + attrs.trim() + '}' : '');
    }

    /** A paragraph. Blank-line separation is the caller's job (see join()). */
    function para(body) { return String(body == null ? '' : body); }

    /**
     * A horizontal rule. Pandoc turns `* * *` into a LaTeX rule; the spaced form is
     * used rather than `---` because three bare hyphens under a paragraph is a setext
     * heading, and the designer lets a rule sit anywhere.
     */
    function rule() { return '* * *'; }

    /**
     * A hard page break that survives to LaTeX. `\newpage` in a raw-LaTeX block is
     * the only construct pandoc passes through verbatim to a PDF writer; a markdown
     * form for this does not exist.
     */
    function pageBreak() { return rawLatex('\\newpage'); }

    /* -------------------------------------------------------------------------
     * SPC-1: whitespace as a MEASUREMENT.
     *
     * Markdown has exactly one way to make vertical space — end a paragraph — and it
     * has no size. Repeating it does nothing either: consecutive blank lines are one
     * paragraph break however many you write, and LaTeX's `\parskip` is the same
     * whether one or six were asked for. So "leave 40mm here for a signature" was not
     * expressible at all, and the attempt (a run of line breaks) came out as the single
     * blank line it always was.
     *
     * A length is expressible, in the same raw-LaTeX fences the page break and the
     * centring already travel in. Two shapes, because vertical space between blocks and
     * vertical space inside a table row are different constructs on the page:
     *
     *   * `\vspace*` — a gap between blocks. STARRED, so it is not discarded at a page
     *     break: a section pushed 60mm down its own page has to survive being the first
     *     thing on that page, which is the whole point of asking.
     *   * `\rule[-h]{0pt}{0pt}` — a strut with depth and no height or width, at the end
     *     of a row's first cell. Depth rather than height: a strut with height pushes
     *     the cell's own text DOWN to sit on the bottom of the box, and a signature line
     *     wants its label at the top and the empty space beneath it.
     *
     * The number is interpolated into LaTeX, which is the one place this file's escaping
     * does not reach — so it is a NUMBER, clamped and rounded here, never a string that
     * came from a text box. (Same rule, and the same precedent, as narrowOpen's scale.)
     * ---------------------------------------------------------------------- */
    var MAX_MM = 500;   // two A4 pages of gap; past this it is a mistake, not a layout

    /** A sanitised millimetre length, or '' for "no space asked for". */
    function mmLen(v) {
      var n = Number(v);
      if (!isFinite(n) || n <= 0) return '';
      return (Math.round(Math.min(n, MAX_MM) * 100) / 100) + 'mm';
    }

    /** SPC-1: a vertical gap of `v` millimetres between blocks. '' when none. */
    function vspace(v) {
      var len = mmLen(v);
      return len ? rawLatex('\\vspace*{' + len + '}') : '';
    }

    /** SPC-1: the strut that makes a table row `v` millimetres taller. '' when none. */
    function rowStrut(v) {
      var len = mmLen(v);
      return len ? '`\\rule[-' + len + ']{0pt}{0pt}`{=latex}' : '';
    }

    /**
     * A raw-LaTeX block, passed through verbatim by pandoc's LaTeX writer and shown as
     * machinery (never as content) by the preview.
     *
     * Callers pass a MACRO NAME, not a body of LaTeX built from data: everything
     * data-derived in this file goes through text()/cell(), and a raw block is the one
     * place that escaping does not reach. The macros themselves are defined once, in
     * App.docFormat's preamble, which is also what keeps their behaviour a formatting
     * decision rather than something smeared through the document.
     */
    function rawLatex(s) { return '```{=latex}\n' + String(s == null ? '' : s) + '\n```'; }

    /**
     * Centre a block of already-emitted markdown.
     *
     * A fenced div (`::: {.center}`) is the tidy-looking way to write this and it does
     * NOT work: pandoc's LaTeX writer drops the div and emits the contents unchanged,
     * so the centring silently did nothing in the PDF. (The `data-latex` attribute is a
     * convention of the pandoc-latex-environment FILTER, not native pandoc — and a
     * filter is a dependency this pipeline should not need.) Raw `{=latex}` fences
     * around the block are passed through verbatim, and the markdown between them is
     * still parsed as markdown, which is what a centred TABLE needs.
     */
    function centred(body) {
      return '```{=latex}\n\\begin{center}\n```\n\n' + body + '\n\n```{=latex}\n\\end{center}\n```';
    }

    /**
     * A pipe table. Cells must be single-line — any CELL_BREAK is collapsed to a
     * space, because a pipe table physically cannot represent one.
     * @param {string[]} headers  already cell()-escaped
     * @param {string[][]} rows   already cell()-escaped
     * @param {{align?:string[]}} [opts]  'l'|'c'|'r' per column
     */
    function pipeTable(headers, rows, opts) {
      opts = opts || {};
      var align = opts.align || [];
      // A run of breaks (HUM-1 puts a blank line between list entries) collapses to one
      // space — two would show as a gap the grid form does not have.
      function flat(c) { return String(c == null ? '' : c).split(CELL_BREAK).filter(function (x, i) { return x.length || i === 0; }).join(' ').replace(/\s+/g, ' '); }
      var head = '| ' + headers.map(flat).join(' | ') + ' |';
      var sep = '| ' + headers.map(function (h, i) {
        return align[i] === 'c' ? ':---:' : align[i] === 'r' ? '---:' : '---';
      }).join(' | ') + ' |';
      var body = rows.map(function (r) { return '| ' + r.map(flat).join(' | ') + ' |'; }).join('\n');
      return head + '\n' + sep + (body ? '\n' + body : '');
    }

    /* -------------------------------------------------------------------------
     * TW-1: how a column width reaches the PDF.
     *
     * Markdown has one place to put a column width and it is not an attribute: pandoc
     * derives each column's RELATIVE width from the dash count on a grid table's
     * border row. A pipe table carries no widths at all. So a table with widths must
     * always be drawn as a grid table, and every cell must be wrapped to fit its
     * column — a line that overruns its border does not make a wide column, it stops
     * the block being read as a table.
     *
     * Measured against the pandoc in use (3.1.11): column i arrives in the LaTeX
     * writer as (dashes_i + 1) / lineLength, where dashes_i is the field width plus
     * the two padding spaces and lineLength is the whole border row. Solving that for
     * the field width is what widthsFor does, so the fraction the operator dragged is
     * the fraction `\real{…}` carries into the longtable column spec.
     * ---------------------------------------------------------------------- */

    // The source width a width-bearing table is drawn to. Only the FRACTIONS reach the
    // PDF, so this number decides nothing but how legible the .md is to a human.
    var WIDTH_BUDGET = 96;
    var MIN_COL = 3;
    // Pandoc's `--columns` default. Past it, a pipe table's widths stop being LaTeX's
    // business and become pandoc's, which reads them off the separator row (see table()).
    var PIPE_MAX = 72;

    /** Field widths for `n` columns from fractions summing to ~1. */
    function widthsFor(fracs, n) {
      var total = WIDTH_BUDGET + 3 * n + 1;
      // The stored widths are relative SHARES, not a partition: typing 60% into one
      // column and 50% into another is a thing the designer can do, and it means "give
      // the first six-elevenths of whatever there is". Normalising here is what makes
      // an over- or under-committed set render as something rather than as nothing.
      var sum = 0, i;
      for (i = 0; i < n; i++) {
        var v = Number((fracs || [])[i]);
        if (isFinite(v) && v > 0) sum += v;
      }
      var out = [];
      for (i = 0; i < n; i++) {
        var f = Number((fracs || [])[i]);
        if (!isFinite(f) || f <= 0) f = sum > 0 ? 0 : 1 / n;
        else if (sum > 0) f = f / sum;
        out.push(Math.max(MIN_COL, Math.round(f * total) - 3));
      }
      return out;
    }

    /* -------------------------------------------------------------------------
     * AUTO-1: what "automatic" width means when the content will not fit.
     *
     * Sizing every column to its widest line is right while the table is narrow enough
     * to hold them all, and badly wrong once it is not — because pandoc reads the
     * source widths as PROPORTIONS. One column of long prose (the control-coverage
     * "Items" cell, which lists every package satisfying a control) then claims almost
     * the whole page and squeezes "Control", "Status" and "Justification" into a few
     * characters each. That is the mashed-up table: not a rendering fault, a
     * measurement one.
     *
     * So a table that does not fit is laid out the way any table layout does it: every
     * column first gets the width it CANNOT go below — its longest unbreakable word,
     * since wrapping cannot break one — and only the slack above that is shared out, in
     * proportion to how much each column actually wants. A heading is never squeezed
     * below itself, and the long column takes the surplus instead of taking everything.
     *
     * A table that DOES fit is untouched, byte for byte, which is most of them.
     * ---------------------------------------------------------------------- */

    /**
     * The longest run in a cell with no space in it — what a wrap cannot break without
     * breaking the content itself.
     *
     * Measured on the SOURCE, markup and all, because that is what the wrapper has to
     * fit. It is tempting to discount a code span, on the grounds that `\seqsplit` will
     * break the identifier on the page anyway — but the break here happens in the
     * MARKDOWN, and a fence cut in half stops being a fence: `` `appInstall `` on one
     * line and `` Whitelist` `` on the next is rejoined by pandoc as one span with a
     * space through the middle of the package name, and the emphasis markers around it
     * come out as literal asterisks. So the floor is the whole token. It costs source
     * width, which is cosmetic, and it buys the guarantee that the auto path never cuts
     * a token in half.
     */
    function longestWord(s) {
      var w = 0;
      String(s == null ? '' : s).split(CELL_BREAK).forEach(function (line) {
        line.split(/\s+/).forEach(function (t) { w = Math.max(w, t.length); });
      });
      return w;
    }

    /* -------------------------------------------------------------------------
     * AUTO-2: the columns are measured in EMS, not in characters.
     *
     * Counting characters is the wrong currency, and it fails in one specific,
     * visible way: a column gets a share of the page proportional to its character
     * count, but spends that share in POINTS, and a character does not cost a fixed
     * number of points. `i` is a third of the width of `m`; a monospace package name
     * costs 0.6em a character while prose averages half that; bold costs another few
     * per cent. In a register table — one monospace key column beside four of prose —
     * the rate that falls out is well under what prose actually needs, so everything is
     * squeezed. Prose absorbs it by wrapping. A single unbreakable word cannot, and
     * pushes past its column into the next one, which is exactly the symptom.
     *
     * So each column is measured in ems: what it WANTS (its widest line) and what it
     * cannot go below (its longest unbreakable run). The budget is the page in ems, less
     * what pandoc spends on inter-column padding — it writes the fractions against
     * `(\columnwidth - 2(n-1)\tabcolsep)`, so that padding is not the columns' to share
     * and counting it would over-promise every one of them.
     *
     * The result is converted back to source characters at the end, because that is what
     * a grid table is drawn in. The conversion is uniform, so it cannot reintroduce the
     * bias — and the character floor is applied on top of the em floor, so a run of
     * narrow letters is still never cut in half.
     * ---------------------------------------------------------------------- */

    /* Advance widths in ems, MEASURED from Latin Modern at 11pt rather than guessed —
     * `\savebox`/`\the\wd` over representative strings, which is the only way to get
     * these right and cheap to redo if the shipped font ever changes:
     *
     *   a-z 12.70em/26 = 0.489    A-Z 18.54em/26 = 0.713    0-9 4.98em/10 = 0.498
     *   i 0.277   m 0.829   e 0.442   . 0.277   space 0.331   ttfamily 0.523
     *   bold/regular over the whole lowercase alphabet = 1.151
     *
     * The first guess at these had bold at 1.06 and monospace at 0.6, and it put
     * "Description" 8pt past its column — which is how the numbers came to be measured.
     */
    var EM_NARROW = 'iljtfrI().,;:\'"!|[]-';
    var EM_WIDE = 'mwMW@%';
    var EM_UPPER = 'ABCDEFGHJKLNOPQRSTUVXYZ';
    var EM_MONO = 0.53;         // \texttt advance, fixed by definition
    var EM_BOLD = 1.15;         // bold over regular, across the lowercase alphabet
    var EM_PER_CHAR = 0.5;      // the rate used to turn ems back into source characters
    // The measurements are within about 6% either way on a short word, and being short
    // is the direction that shows: a floor a little too generous costs a wrappable
    // column a few points, one a little too mean puts a heading through its border.
    var FLOOR_SAFETY = 1.08;
    // Pandoc writes the column fractions against `\columnwidth - 2(n-1)\tabcolsep`, and
    // \tabcolsep is 6pt against an 11pt em — that padding is not the columns' to share.
    var EM_GUTTER = 2 * 6 / 11;
    // The text block of the shipped profile — A4 less 25mm each side — in ems at 11pt.
    var PAGE_EM = 160 / 25.4 * 72 / 11;

    function charEm(c) {
      if (EM_NARROW.indexOf(c) !== -1) return 0.3;
      if (EM_WIDE.indexOf(c) !== -1) return 0.85;
      if (EM_UPPER.indexOf(c) !== -1) return 0.66;
      return 0.5;
    }

    /**
     * The typeset width of one already-escaped source line, in ems.
     *
     * Walks it rather than measuring it flat, because the markup is not printed and the
     * characters inside it are not all charged at the same rate: a backslash escape
     * costs only the character it escapes, a code fence costs nothing and puts what it
     * contains on the monospace rate, and `**` costs nothing but makes what it contains
     * bold.
     */
    /* REF-2: a link is measured by what it PRINTS, not by what it is written as.
     *
     * `[AHG-001](#ctl-ahg-001)` is 23 characters of source and seven of page. Measuring
     * the source charged the column three times what the link costs, which moved the
     * proportions of every table carrying a control mention — measured in a built PDF as
     * a 3pt overfull box that was not there before the mentions became links.
     *
     * The SOURCE width is a separate question and is still counted in full (a link cut
     * in half stops being one, D-036); that is what `atomicRun` is for. This is the
     * page, and on the page the destination is not set.
     */
    var LINK_TEXT = /\[([^\]\n]*)\]\([^)\s\n]*\)/g;
    function printed(s) { return String(s == null ? '' : s).replace(LINK_TEXT, '$1'); }

    function lineEm(s) {
      var str = printed(s), out = 0, mono = false, bold = false;
      for (var i = 0; i < str.length; i++) {
        var c = str.charAt(i);
        if (c === '\\' && i + 1 < str.length) { out += charEm(str.charAt(++i)); continue; }
        if (c === '`') { mono = !mono; continue; }
        if (c === '*' && !mono) {
          if (str.charAt(i + 1) === '*') { i++; bold = !bold; } // ** toggles bold
          continue;                                             // a single * is emphasis
        }
        out += mono ? EM_MONO : charEm(c) * (bold ? EM_BOLD : 1);
      }
      return out;
    }

    /**
     * The widest run with no space in it, in ems — what the PAGE cannot go below.
     *
     * A code span is skipped, and this is the one place that distinction belongs: the
     * formatting profile routes every `\texttt` through `\seqsplit`, so a 40-character
     * package name has a breakpoint between every character once it reaches the page and
     * is not a floor at all. In the SOURCE it still is one (a cut fence stops being a
     * fence — D-021), which is why that floor is counted separately, in characters.
     * Charging the page for both is what made the floors exceed the page and left every
     * column, including the prose ones that genuinely could not wrap, below its need.
     */
    function longestWordEm(s, includeCode) {
      var w = 0;
      // REF-2: the destination is not set on the page, so it is not a run on the page.
      printed(s).split(CELL_BREAK).forEach(function (line) {
        var text = includeCode ? line : line.replace(/`+[^`]*`+/g, ' ');
        text.split(/\s+/).forEach(function (t) { w = Math.max(w, lineEm(t)); });
      });
      return w;
    }

    /**
     * Auto widths for `n` columns of `all` rows: natural where they fit, shared out
     * against the page where they do not. Returned in SOURCE CHARACTERS.
     *
     * @param {{pageEm?:number, head?:number, body?:number, firstCol?:number}} [metrics]
     *        The page in ems and each table font size relative to the document's.
     *        They have to be passed in because a table set at 12pt in an 11pt document
     *        needs a ninth more room than the same table set at 11pt, and this module
     *        has no business knowing which profile is in force. Absent, everything is
     *        the shipped profile at one size — which is what it was before FNT-1.
     *        FNT-6: `firstCol` is the first column's own size, on the same rule — a key
     *        column set smaller needs less room than the body, and one set larger needs
     *        more, which is exactly the arithmetic D-027 was about.
     */
    function autoWidths(all, n, metrics) {
      metrics = metrics || {};
      var pageEm = metrics.pageEm > 0 ? metrics.pageEm : PAGE_EM;
      var headScale = metrics.head > 0 ? metrics.head : 1;
      var bodyScale = metrics.body > 0 ? metrics.body : 1;
      var colScale = metrics.firstCol > 0 ? metrics.firstCol : bodyScale;
      return layout(all, n, pageEm, headScale, bodyScale, colScale);
    }

    function layout(all, n, PAGE_EM, headScale, bodyScale, colScale) {
      if (!(colScale > 0)) colScale = bodyScale;
      var wantEm = [], floorEm = [], softEm = [], floorChars = [], natural = [], i;
      for (i = 0; i < n; i++) {
        var line = 0, word = 0, soft = 0, chars = MIN_COL, cols = MIN_COL;
        all.forEach(function (r, ri) {
          // Row 0 is the header, which may be set at its own size (FNT-1); column 0's
          // body cells may be set at theirs (FNT-6).
          var k = ri === 0 ? headScale : (i === 0 ? colScale : bodyScale);
          splitCell(r && r[i]).forEach(function (l) { line = Math.max(line, lineEm(l) * k); cols = Math.max(cols, l.length); });
          word = Math.max(word, longestWordEm(r && r[i], false) * k);
          soft = Math.max(soft, longestWordEm(r && r[i], true) * k);
          chars = Math.max(chars, longestWord(r && r[i]));
        });
        natural.push(cols);
        wantEm.push(Math.max(line, soft, MIN_COL * EM_PER_CHAR));
        // The safety margin is about FLOORS — the widths below which something visibly
        // breaks — not about how wide a column would like to be.
        word = word * FLOOR_SAFETY;
        soft = soft * FLOOR_SAFETY;
        floorEm.push(Math.max(word, MIN_COL * EM_PER_CHAR));
        /* The SOFT floor is what an identifier would like: a code span can be broken on
         * the page (`\seqsplit`), so it is not a floor — but broken every six characters
         * it stops being readable, and "it can be broken" is not the same as "break it
         * as far as you like". So it is asked for after the hard floors are met and
         * before anything is spent on the columns that merely want to be wider. */
        softEm.push(Math.max(soft, floorEm[i]));
        // The em floors govern the PAGE; this one governs the SOURCE, and both have to
        // hold or a narrow-lettered token would still be cut in half (D-021).
        floorChars.push(chars);
      }

      /* Ems decide the PROPORTIONS; characters only decide how the .md is drawn.
       *
       * Both floors have to hold at once and they pull opposite ways: the source floor
       * includes code spans (a cut fence corrupts the identifier — D-021) while the page
       * floor excludes them (`\seqsplit` breaks them on the page). Taking the larger of
       * the two per column would let the source floor set the FRACTION, which is what
       * gave the key column a third of the page and squeezed the prose headings through
       * their borders.
       *
       * Since only ratios reach the PDF, the whole table can be scaled up instead —
       * uniformly, by just enough that the widest source floor fits. Every fraction is
       * preserved exactly and every token stays whole. The cost is a wide .md, which is
       * cosmetic.
       */
      function toChars(ems) {
        var scale = 1;
        ems.forEach(function (em, j) {
          if (em > 0) scale = Math.max(scale, floorChars[j] * EM_PER_CHAR / em);
        });
        return ems.map(function (em, j) {
          return Math.max(MIN_COL, floorChars[j], Math.round(em * scale / EM_PER_CHAR));
        });
      }

      var wantTotal = wantEm.reduce(function (a, w) { return a + w; }, 0);
      var budget = PAGE_EM - EM_GUTTER * (n - 1);
      // It fits: every column takes its widest line and there is nothing to decide. The
      // measured widths are the natural ones, in characters — the em model exists to
      // settle a competition, and there is no competition here. It also keeps a small
      // table's markdown exactly as tidy as it always was.
      if (wantTotal <= budget) return natural;

      /* Three claims on the page, settled in order of how badly they fail:
       *   1. the HARD floors — a word with nothing to break it, which overflows into the
       *      next column if it is short-changed. Met first, always.
       *   2. the SOFT floors — an identifier that can be broken but should not be minced.
       *   3. APPETITE — a column that would simply rather be wider, and wraps if it is not.
       * Anything left after the hard floors goes to 2, then to 3. */
      var floorTotal = floorEm.reduce(function (a, w) { return a + w; }, 0);
      // Even the unbreakable words do not fit. Nothing can be honoured, so they share
      // the page in proportion and something will overflow — there is no layout that
      // avoids it, and pretending otherwise would only hide which one.
      if (floorTotal >= budget) {
        return toChars(floorEm.map(function (w) { return w / floorTotal * budget; }));
      }
      var out = floorEm.slice();
      var room = budget - floorTotal;

      function share(need) {
        var total = need.reduce(function (a, w) { return a + w; }, 0);
        if (total <= 0 || room <= 0) return;
        var spend = Math.min(room, total);
        need.forEach(function (w, j) { out[j] += w / total * spend; });
        room -= spend;
      }
      share(softEm.map(function (w, j) { return Math.max(0, w - floorEm[j]); }));
      share(wantEm.map(function (w, j) { return Math.max(0, w - out[j]); }));
      return toChars(out);
    }

    /**
     * Where a cut at `at` would land inside a backslash escape, step back off it.
     * The text being wrapped has already been through text(), so `\_` is one unit; a
     * break between the two halves would free the `_` to start emphasis on the next
     * line. Counts the run because `\\` is an escaped backslash, not an escaper.
     */
    /* REF-2: the spans a cut must not land inside, as [start, end) pairs.
     *
     * A markdown link is the case that matters: pandoc rejoins a cell's lines with a
     * SPACE, so a break anywhere inside `[AHG-001](#ctl-ahg-001)` produces
     * `](#ctl-ahg- 001)` — a destination with a space in it, which is not a link at all.
     * The reader gets the raw brackets printed at them and no link in the PDF. Exactly
     * the shape of D-021, which was the same rejoin breaking a `**` pair.
     */
    var LINK_SPAN = /\[[^\]\n]*\]\([^)\s\n]*\)/g;
    function noCutZones(s) {
      var out = [], m;
      LINK_SPAN.lastIndex = 0;
      while ((m = LINK_SPAN.exec(s)) !== null) out.push([m.index, m.index + m[0].length]);
      return out;
    }

    function safeCut(s, at) {
      var zones = noCutZones(s);
      var i = at;
      while (i > 0) {
        var run = 0, j = i - 1;
        while (j >= 0 && s.charAt(j) === '\\') { run++; j--; }
        // A cut between the two asterisks of `**` leaves a lone `*` on each line, which
        // is not emphasis at all. Never land inside a marker run.
        var inMarker = s.charAt(i - 1) === '*' && s.charAt(i) === '*';
        var inLink = zones.some(function (z) { return i > z[0] && i < z[1]; });
        if (run % 2 === 0 && !inMarker && !inLink) return i;
        i--;
      }
      return at;
    }

    /**
     * The longest run in a cell that must survive whole — a link, or any space-free
     * token (a code fence cut in half corrupts the identifier inside it, D-021).
     */
    function atomicRun(cell) {
      var w = 0;
      splitCell(cell).forEach(function (line) {
        noCutZones(line).forEach(function (z) { w = Math.max(w, z[1] - z[0]); });
        line.split(/\s+/).forEach(function (t) { w = Math.max(w, t.length); });
      });
      return w;
    }

    /**
     * Scale a set of widths up until every column can hold what must survive whole.
     *
     * Uniform, so the proportions are untouched — the .md simply gets wider. That is the
     * same trade `layout`'s toChars makes, and for the same reason: only the RATIOS
     * reach the PDF, so source width is free and re-proportioning is not.
     *
     * @param {number[]} widths field widths in characters
     * @param {Array} rows all rows, header included
     * @param {number[]} [claims] extra per-column runs that must fit (a shading prefix,
     *        a row anchor) — source text that is emitted on a line of its own
     */
    function holdWhole(widths, rows, claims) {
      var need = widths.map(function (_, i) {
        var w = (claims && claims[i]) || 0;
        rows.forEach(function (r) { w = Math.max(w, atomicRun(r && r[i])); });
        return w;
      });
      var scale = 1;
      widths.forEach(function (w, i) { if (w > 0 && need[i] > w) scale = Math.max(scale, need[i] / w); });
      if (scale === 1) return widths;
      return widths.map(function (w, i) { return Math.max(MIN_COL, need[i], Math.round(w * scale)); });
    }

    /**
     * Hard-wrap one line to a character width. Breaks at spaces; a single run longer
     * than the column is broken mid-run, because a column that grew to fit it would
     * silently be a different width from the one that was asked for.
     * @returns {string[]} at least one line
     */
    function wrapLine(s, width) {
      var w = Math.max(1, width | 0);
      var str = String(s == null ? '' : s);
      if (str.length <= w) return [str];
      var out = [], rest = str;
      while (rest.length > w) {
        var at = rest.lastIndexOf(' ', w);
        // No space to break at (or one only at the very start) — break the run itself.
        if (at <= 0) at = safeCut(rest, w);
        out.push(rest.slice(0, at).replace(/\s+$/, ''));
        rest = rest.slice(at).replace(/^\s+/, '');
        if (!rest.length) break;
      }
      if (rest.length) out.push(rest);
      return out.length ? out : [''];
    }

    function splitCell(c) { return String(c == null ? '' : c).split(CELL_BREAK); }

    /* -------------------------------------------------------------------------
     * TBL-2: a grid table is measured against pandoc's `--columns`, not against itself.
     *
     * A pipe table narrower than `--columns` (72 by default) is handed to LaTeX with no
     * widths at all — `@{}lll@{}` — and LaTeX sizes each column to its content, which is
     * what a small table should look like. A GRID table is never handed over that way:
     * pandoc always writes explicit `p{}` fractions for one, and it divides the segment
     * lengths by **max(line length, --columns)** rather than by the line length. So a
     * 32-character grid table came out as three columns of 0.1389 + 0.1250 + 0.1667 —
     * a table 43% of the width of the page, with every column squeezed to match.
     * Measured on pandoc 3.1.11, not read.
     *
     * That is invisible until something forces a small table into the grid form, and
     * TBL-1's title row is exactly such a thing: adding a title to a table that fitted
     * on a line shrank it to under half the page and re-proportioned its columns. The
     * columns were not the fault — the table's SOURCE WIDTH was.
     *
     * So an automatic grid table is drawn to the same source budget an explicit one is.
     * The ratios between the columns are untouched (this is a uniform scale, the same
     * trade holdWhole and layout's toChars already make); what changes is that the
     * fractions now add up to the page, so a grid table fills the text block the way its
     * pipe-form twin does. Only widths BELOW the budget are scaled: a table already wider
     * than it has been laid out by autoWidths and is not second-guessed here.
     * ---------------------------------------------------------------------- */
    function fillLine(widths, n) {
      var total = widths.reduce(function (a, w) { return a + (w > 0 ? w : 0); }, 0);
      if (!(total > 0) || total >= WIDTH_BUDGET) return widths;
      var scale = WIDTH_BUDGET / total;
      return widths.map(function (w) { return Math.max(MIN_COL, Math.round(w * scale)); });
    }

    /**
     * A grid table — the only markdown table that can hold a multi-line cell, which
     * is what a hand-authored table in a custom section needs.
     *
     * Without `opts.widths` nothing is wrapped and each column is made as wide as its
     * widest line, exactly as before: guessing a wrap width would only fight the LaTeX
     * layout that actually decides the final line breaks. With widths, the columns are
     * the ones asked for and the content is wrapped into them (see TW-1 above).
     *
     * @param {{align?:string[], widths?:number[], cellPrefix?:string[], rowAnchors?:string[]}} [opts]
     *        cellPrefix is a per-column raw-LaTeX span placed on its OWN first line of
     *        every body cell (TBS-1 shading). Its own line so that it costs the column
     *        no width: pandoc folds a cell's consecutive lines into one paragraph.
     *        rowAnchors is the same idea per ROW rather than per column — one anchor
     *        span at the head of each body row's first cell (REF-2), so a link can land
     *        on a particular row of a table rather than on the table.
     */
    function gridTable(headers, rows, opts) {
      opts = opts || {};
      var align = opts.align || [];
      var pre = opts.cellPrefix || [];
      /* SPC-1: the row-height strut, at the END of the first cell rather than the head of
       * it — see rowStrut. One per row is enough: a row is as tall as its tallest cell.
       *
       * `suffixRows` says WHICH rows take it: an array of booleans, one per row, or null
       * for all of them. Null rather than an array of trues, because "every row" is the
       * ordinary case and an absent list is how the rest of this file writes a default. */
      var suf = opts.cellSuffix || '';
      var sufRows = Array.isArray(opts.suffixRows) ? opts.suffixRows : null;
      function wantsSuffix(i) { return !!suf && (!sufRows || sufRows[i] !== false); }
      var anchors = opts.rowAnchors || [];
      var headPre = opts.headPrefix || '';
      var n = headers.length;
      var explicit = !!(opts.widths && opts.widths.length === n);
      var widths = explicit ? widthsFor(opts.widths, n) : fillLine(autoWidths([headers].concat(rows), n, opts.metrics), n);
      // A prefix is literal source text, so a column carrying one can never be
      // narrower than it — otherwise the raw-LaTeX span would be wrapped and broken.
      // A row anchor is the same kind of claim on the FIRST column: it is emitted whole,
      // on its own line, and a column too narrow to hold it would break it in half.
      /* What each column must be able to hold WHOLE, on its own line: a shading prefix,
       * a row anchor, and any run in its cells that cannot be broken.
       *
       * Widened by SCALING THE TABLE, never by widening the one column. Pandoc reads a
       * column's share of the page off its share of the border row, so making column 0
       * bigger to fit a 19-character anchor takes that width from every other column —
       * and the anchor costs nothing on the page (`\hypertarget` is zero-width), so the
       * page was being re-proportioned to make room for something that is not there.
       * Measured: it put a 10pt overfull box in the Control coverage table. Scaling
       * uniformly leaves every proportion exactly as it was and only widens the .md.
       */
      var widest = anchors.reduce(function (a, s) { return Math.max(a, String(s || '').length); }, 0);
      widths = holdWhole(widths, [headers].concat(rows), widths.map(function (_, i) {
        // SPC-1: the strut is the same kind of claim on column 0 as the anchor above —
        // emitted whole on a line of its own, costing the page nothing (it is zero-width)
        // but costing the SOURCE the characters it is written in.
        return Math.max(pre[i] ? pre[i].length : 0, headPre.length,
          i === 0 ? Math.max(widest, rows.some(function (_, ri) { return wantsSuffix(ri); }) ? suf.length : 0) : 0);
      }));
      /* A HAND-SET width must still hold what cannot be broken.
       *
       * The automatic path has honoured this since D-021 (see layout/toChars): a column
       * is never narrower than its longest unbreakable run, and the whole table is
       * scaled up until that fits, because only the RATIOS reach the PDF. The explicit
       * path had no such floor at all — it wrapped to whatever was dragged — so a
       * narrow column cut a package name in half, or a cross-reference through its own
       * destination (`](#ctl-ahg- 001)`), which stops being a link.
       *
       * The same answer, applied to the same numbers: find the ratio by which the
       * tightest column falls short, scale every column by it, and the .md gets wider
       * while the fractions the operator dragged are preserved exactly.
       */

      function padTo(s, w) { return s + new Array(Math.max(0, w - s.length) + 1).join(' '); }
      /* TBL-1: the width INSIDE the outer borders — what a spanning row has to fill.
       * Every column plus its two padding spaces, plus the internal `+` each join costs. */
      var spanWidth = widths.reduce(function (a, w) { return a + w + 2; }, 0) + (n - 1);
      function border(ch) {
        return '+' + widths.map(function (w, i) {
          var bar = new Array(w + 3).join(ch);
          // Alignment is carried by the `:` markers on the HEADER separator, and only
          // there. Putting them on the `-` borders too made pandoc 3.1.11 silently drop
          // every body row — the table compiled to a header and nothing else, which is
          // worse than a broken table because it looks deliberate. Measured, not read:
          // the same table with colons on the header row alone reads all its rows.
          if (ch === '=') {
            if (align[i] === 'c') return ':' + bar.slice(1, -1) + ':';
            if (align[i] === 'r') return bar.slice(0, -1) + ':';
            if (align[i] === 'l') return ':' + bar.slice(1);
          }
          return bar;
        }).join('+') + '+';
      }
      // Wrapping is unconditional: against a natural width it is a no-op (a line that
      // already fits comes back unchanged), and against a narrowed one it is the whole
      // point. One path rather than two means the auto and explicit cases cannot drift.
      function linesFor(c, i, isHeader, anchor, tall) {
        var out = [];
        splitCell(c).forEach(function (l) {
          wrapLine(l, widths[i]).forEach(function (x) { out.push(x); });
        });
        if (!isHeader && i === 0 && anchor) out.unshift(anchor);
        if (!isHeader && pre[i]) out.unshift(pre[i]);
        // SPC-1: last, and in the first column only — pandoc folds a cell's consecutive
        // lines into one paragraph, so this lands at the end of that paragraph, which is
        // the line whose depth decides where the bottom of the row falls.
        if (!isHeader && i === 0 && tall) out.push(suf);
        // TBL-1: on its own line, so it costs the column no width — pandoc folds a
        // cell's consecutive lines into one paragraph.
        if (isHeader && headPre) out.unshift(headPre);
        return out;
      }
      function rowBlock(r, isHeader, anchor, tall) {
        var cellLines = widths.map(function (_, j) { return linesFor(r && r[j], j, isHeader, anchor, tall); });
        var h = cellLines.reduce(function (a, c) { return Math.max(a, c.length); }, 1);
        var out = [];
        for (var i = 0; i < h; i++) {
          out.push('| ' + widths.map(function (w, j) { return padTo(cellLines[j][i] || '', w); }).join(' | ') + ' |');
        }
        return out.join('\n');
      }
      /* TBL-1: a title row is a REAL merged row, and pandoc does support one.
       *
       * A grid table's header is every row above the `=` separator, and a row whose
       * internal `|` are omitted is read as a cell spanning those columns — verified on
       * pandoc 3.1.11, which emits it as `\multicolumn{3}{…}`. So the title is the first
       * of two header rows rather than a paragraph balanced on top of the table, which
       * is what it was and what could never be the right width: a paragraph has to be
       * given one, and a table's width is not known until it is typeset.
       */
      var parts = [];
      if (opts.titleRow) {
        parts.push('+' + new Array(spanWidth + 1).join('-') + '+');
        wrapLine(String(opts.titleRow), spanWidth - 2).forEach(function (l) {
          parts.push('| ' + padTo(l, spanWidth - 2) + ' |');
        });
      }
      parts.push(border('-'), rowBlock(headers, true), border('='));
      rows.forEach(function (r, i) { parts.push(rowBlock(r, false, anchors[i], wantsSuffix(i)), border('-')); });
      if (!rows.length) parts.push(border('-'));
      return parts.join('\n');
    }

    /* -------------------------------------------------------------------------
     * TBS-1: a styled header row / first column.
     *
     * Bold and italic are markdown and cost nothing. SHADING is not expressible in
     * markdown at all, so it travels the same way the page break and the centring
     * already do — as raw `{=latex}` fences pandoc passes through verbatim:
     *
     *   * the header row, by locally redefining `\toprule` (which pandoc emits
     *     immediately before the header of every longtable) to also emit `\rowcolor`.
     *     Wrapped in `\begingroup`/`\endgroup`, so the redefinition reaches exactly
     *     this table and nothing after it.
     *   * the first column, by a `\cellcolor` at the head of each body cell —
     *     `\columncolor` would have to be in the column spec, which pandoc writes and
     *     we do not. `\rowcolor` cannot do a column.
     *
     * Both were verified against pandoc 3.1.11 + tectonic 0.15, not assumed: pandoc's
     * LaTeX writer honours neither a fenced div nor a cell attribute here.
     * The macros themselves are defined by App.docFormat's preamble.
     * ---------------------------------------------------------------------- */

    var HEAD_SHADE_OPEN = '```{=latex}\n\\begingroup\\chTblHeadShade\n```';
    var HEAD_SHADE_CLOSE = '```{=latex}\n\\endgroup\n```';
    var COL_SHADE = '`\\chTblColShade`{=latex}';
    /* FNT-6: the first column's SIZE, by the same route as its shade.
     *
     * Weight and slope travel as markdown emphasis on the cell, and markdown has no way
     * to say "and set this column two points smaller" — which is why the first column
     * was the one kind of text in the document with no size of its own. A size is
     * expressible the way the shade already is: a raw-LaTeX span at the head of each
     * body cell, calling a macro the profile defines. `\raggedright` (which is where the
     * row-font machinery lives, see App.docFormat) runs from the column spec, before the
     * cell's content, so a `\selectfont` inside the cell is the later word and wins.
     *
     * The macro is named rather than expanded here: what size it is remains a formatting
     * question, and App.md has no business knowing which profile is in force. */
    var COL_FONT = '`\\chTblColFont`{=latex}';
    // TBL-1: the same, for a header cell — needed only when a title row has taken the
    // one `\rowcolor` that `\toprule` can carry. See App.docFormat's tablePreamble.
    var HEAD_CELL_SHADE = '`\\chTblHeadCell`{=latex}';
    var GROUP_CLOSE = '```{=latex}\n\\endgroup\n```';

    /* -------------------------------------------------------------------------
     * TW-3: a table narrower than the page.
     *
     * Three columns at 20% each should make a table 60% of the text width, not three
     * equal columns filling it. Markdown cannot say that: pandoc derives a column's
     * width from its share of the BORDER ROW, so the shares it reads always add up to
     * the whole line however the table is drawn. The total is simply not expressible
     * there.
     *
     * What is expressible is the thing the widths are measured against. Pandoc emits
     * every column as `p{(\columnwidth - N\tabcolsep) * \real{f}}`, so shrinking
     * `\columnwidth` for the duration of one table scales all of them together and the
     * table comes out that fraction of the page — centred, which is what longtable does
     * with a table narrower than the text block. Verified on pandoc 3.1.11 + tectonic.
     *
     * Over 100% is clamped rather than honoured: a table wider than the page is not a
     * layout, it is an overflow, and the designer is told in red instead.
     * ---------------------------------------------------------------------- */
    function narrowOpen(scale) {
      return '```{=latex}\n\\begingroup\\setlength{\\columnwidth}{' + scale.toFixed(4) + '\\columnwidth}\n```';
    }

    /** Wrap already-escaped cell text in emphasis, per line, leaving blanks alone. */
    function emphasise(c, style) {
      if (!style || (!style.bold && !style.italic)) return c;
      var mark = (style.bold ? '**' : '') + (style.italic ? '*' : '');
      if (!mark) return c;
      return splitCell(c).map(function (seg) {
        return seg.trim() ? mark + seg + mark.split('').reverse().join('') : seg;
      }).join(CELL_BREAK);
    }

    /**
     * Emit a table, choosing the representation from the content: a grid table when
     * any cell is multi-line, when widths are set, or when a shaded first column needs
     * a prefix line; a pipe table otherwise. Callers do not have to know which — they
     * hand over cell()-escaped strings and get a table that holds.
     *
     * @param {{align?:string[], widths?:number[],
     *          style?:{head?:Object, firstColumn?:Object},
     *          caption?:{id:string, text:string}}} [opts]
     */
    function table(headers, rows, opts) {
      opts = opts || {};
      var st = opts.style || {};
      var head = st.head ? headers.map(function (c) { return emphasise(c, st.head); }) : headers;
      var body = st.firstColumn
        ? rows.map(function (r) { return (r || []).map(function (c, i) { return i === 0 ? emphasise(c, st.firstColumn) : c; }); })
        : rows;

      var pre = [];
      var shadeCol = !!(st.firstColumn && st.firstColumn.shade);
      // FNT-6: `fontSize` is a FLAG here, not a number — the size itself is in the macro.
      var fontCol = !!(st.firstColumn && st.firstColumn.fontSize);
      if (shadeCol || fontCol) pre[0] = (shadeCol ? COL_SHADE : '') + (fontCol ? COL_FONT : '');

      /* Which form, and why it is not just about newlines.
       *
       * A pipe table becomes a LaTeX `tabular` of `l` columns, which do not wrap: a long
       * justification or description runs straight off the right of the page. A grid
       * table becomes `p{}` columns, which do. So the deciding question is not "does a
       * cell contain a line break" but "will this fit on a line" — a table wider than
       * the budget goes to the grid form so its content can wrap, whatever its cells
       * look like. That is what was mashing the control-coverage table: four columns of
       * one-line prose, no wrapping available to any of them.
       */
      var multi = false, natural = headers.length + 1;
      [head].concat(body).forEach(function (r) {
        (r || []).forEach(function (c) { if (String(c == null ? '' : c).indexOf(CELL_BREAK) !== -1) multi = true; });
      });
      headers.forEach(function (_, i) {
        var w = 0;
        [head].concat(body).forEach(function (r) {
          splitCell(r && r[i]).forEach(function (l) { w = Math.max(w, l.length); });
        });
        natural += w + 3;
      });
      var widthed = !!(opts.widths && opts.widths.length === headers.length);
      // REF-2: one anchor span per body row. A pipe table cannot carry one — the span
      // has to sit on a line of its own so it costs the column no width — so a table
      // with row anchors takes the grid form whatever else it looks like.
      var anchored = !!(opts.rowAnchors && opts.rowAnchors.length);
      // TBL-1: a spanning row needs the grid form too — a pipe table has no way to say
      // that a cell covers more than one column.
      var titled = !!opts.titleRow;
      /* TBL-1: with a title row, the one `\rowcolor` that `\toprule` can carry goes to
       * the TITLE — so the column headings need their shade cell by cell, or the row
       * comes out white under a shaded title. Without a title row nothing changes: the
       * row colour reaches the headings as it always has. */
      var headCells = !!(opts.titleRow && st.head && st.head.shade);
      /* SPC-1: extra height on the body rows that asked for it, for a table that is a
       * form to write on rather than a table of readings.
       *
       * `tallRows` is per row, and ABSENT means all of them — which is what a height with
       * no rows named meant before the ticks existed, and what a project written then
       * still says. A list of the wrong length is ignored for the same reason a width
       * array of the wrong length is: it cannot be applied to anything. */
      var strut = rowStrut(opts.rowHeight);
      var tallRows = (Array.isArray(opts.tallRows) && opts.tallRows.length === rows.length)
        ? opts.tallRows.map(function (v) { return v !== false; }) : null;
      var anyTall = !!strut && (!tallRows || tallRows.some(Boolean));
      var sub = { align: opts.align || [], cellPrefix: pre, metrics: opts.metrics,
        rowAnchors: opts.rowAnchors || [], titleRow: opts.titleRow || '',
        cellSuffix: strut, suffixRows: tallRows,
        headPrefix: headCells ? HEAD_CELL_SHADE : '' };
      if (widthed) sub.widths = opts.widths;
      // A prefix cannot live on its own line in a pipe table, so a shaded first column
      // is one more reason the grid form is the only one that can carry it.
      /* PIPE_MAX is pandoc's `--columns` default, and it is the real limit on the pipe
       * form — not the page budget. Up to it, pandoc leaves a pipe table's columns to
       * LaTeX, which sizes them to their content. Past it, pandoc invents widths from
       * the SEPARATOR row, and `| --- | --- |` gives every column an equal share
       * regardless of what is in it — seven equal columns with a heading in each that
       * does not fit. Measured on 3.1.11, not read: an 83-character pipe table comes out
       * as seven `\real{0.1429}` columns. So a table that would cross that line takes
       * the grid form instead, where the widths are ours to decide. */
      // SPC-1: a strut has to sit on a line of its own so it costs the column no width,
      // and a pipe table has no lines inside a cell — so a sized row takes the grid form
      // whatever else the table looks like, exactly as a shaded first column does.
      var grid = multi || widthed || shadeCol || fontCol || anchored || titled || anyTall || natural > PIPE_MAX;
      var out = (grid ? gridTable : pipeTable)(head, body, sub);

      // The caption must sit directly under the table for pandoc to attach it, so every
      // group closes AFTER it. The anchor goes before the whole thing: pandoc does not
      // read `{#id}` on a caption as an identifier (it printed literally), and an empty
      // span becomes \phantomsection\label{…}, which \hyperref can reach.
      if (opts.caption) out = out + '\n\n: ' + text(opts.caption.text || '');

      // One group carries both the shading and the narrowing rather than two nested
      // ones — same effect, half the raw-LaTeX noise in a file people read.
      var scale = 1;
      if (widthed) {
        var sum = opts.widths.reduce(function (a, w) { return a + (Number(w) > 0 ? Number(w) : 0); }, 0);
        if (isFinite(sum) && sum > 0 && sum < 0.995) scale = sum;
      }
      var prologue = [];
      if (scale < 1) prologue.push('\\setlength{\\columnwidth}{' + scale.toFixed(4) + '\\columnwidth}');
      if (st.head && st.head.shade) prologue.push('\\chTblHeadShade');
      if (prologue.length) {
        out = '```{=latex}\n\\begingroup' + prologue.join('') + '\n```\n\n' + out + '\n\n' + GROUP_CLOSE;
      }
      if (opts.caption && opts.caption.id) out = '[]{#' + anchor('tbl-' + opts.caption.id) + '}\n\n' + out;
      return out;
    }

    /* -------------------------------------------------------------------------
     * HUM-1: a captured value is data, not a JSON document.
     *
     * A decision value is whatever the device reported — a boolean, a number, a string,
     * a whitelist, or a list of firewall-rule records. Through the canonical
     * stringifier it reaches the PDF as JSON: braces, quotes and commas spread down a
     * dozen lines of a table cell. That is the right form for the artifact a device
     * consumes and the wrong one for a document a person signs off.
     *
     * human() is the READING, and deliberately not reversible — nothing parses it back,
     * so it is free to drop the punctuation only a machine needs. The generated
     * `tactical.json` and the verification script still carry the canonical form; this
     * is used where a person is the reader.
     *
     * Entries are separated by a BLANK line rather than a newline, because that is what
     * survives to the page: a grid-table cell folds consecutive lines into one
     * paragraph, so only a blank line keeps a list looking like a list.
     * ---------------------------------------------------------------------- */

    var HUMAN_EMPTY = '(none)';

    /** One value on ONE line — the form used for a nested value inside a list entry. */
    function humanInline(v) {
      if (v === null || v === undefined) return '';
      if (typeof v === 'boolean') return v ? 'true' : 'false';
      if (typeof v === 'number') return isFinite(v) ? String(v) : '';
      if (typeof v === 'string') return v;
      if (Array.isArray(v)) return v.length ? v.map(humanInline).join(', ') : HUMAN_EMPTY;
      if (typeof v !== 'object') return '';
      var keys = Object.keys(v).sort();
      return keys.length ? keys.map(function (k) { return k + ': ' + humanInline(v[k]); }).join('; ') : HUMAN_EMPTY;
    }

    /**
     * The reading of a whole value, over as many lines as it needs.
     * @param {*} v @returns {string} plain text — NOT escaped; pass it through cell()
     */
    function human(v) {
      if (v === null || v === undefined) return '';
      if (Array.isArray(v)) {
        if (!v.length) return HUMAN_EMPTY;
        var records = v.some(function (x) { return x && typeof x === 'object'; });
        // A list of records is numbered: without an ordinal, two adjacent firewall
        // rules carrying the same fields are indistinguishable once printed.
        return records
          ? v.map(function (x, i) { return (i + 1) + '. ' + humanInline(x); }).join('\n\n')
          : v.map(humanInline).join('\n\n');
      }
      if (typeof v === 'object') {
        var keys = Object.keys(v).sort();
        if (!keys.length) return HUMAN_EMPTY;
        return keys.map(function (k) { return k + ': ' + humanInline(v[k]); }).join('\n\n');
      }
      return humanInline(v);
    }

    // ---- rich text -----------------------------------------------------------

    /* The designer's paragraph boxes accept a token markup rather than raw markdown,
     * for one reason: raw markdown cannot coexist with the escaping above. If the
     * user typed `**bold**` the asterisks would be escaped and they would see literal
     * asterisks in the PDF; if the asterisks were left unescaped, a package name
     * containing one would silently start emphasis.
     *
     * So inline formatting travels as {{...}} tokens, which the editor's toolbar
     * inserts around the selection. Tokens are extracted BEFORE escaping and the
     * surrounding literal text is escaped after, so anything that is NOT one of the
     * known tokens — `{{zzz}}`, a stray brace — escapes to literal characters
     * and can never restructure the document. The set is deliberately small: bold,
     * italic, code, line break, and a cross-reference.
     *
     * REF-1: the id charset carries a DOT.
     *
     * It did not, and a block id is `ds:android.packages` — so the one reference a
     * designer is most likely to insert, a link to a register section, did not match
     * this pattern at all. It was therefore never recognised as a token, fell through
     * to text() with everything else, and printed in the PDF as the literal string
     * `{{ref:ds:android.packages}}`. Every reference to a hand-authored section (`sec1`)
     * worked, which is what made it read as "references are broken sometimes".
     *
     * REF-1: three reference tokens rather than one, because a reference has three
     * useful readings and the designer picks between them when inserting it:
     *
     *   {{ref:ID}}   the full label   — "Table 4: Packages removed"
     *   {{refn:ID}}  the number alone — "Table 4"
     *   {{reft:ID}}  the title alone  — "Packages removed"
     *
     * and a fourth form, `{{ref:ID}}…{{/ref}}`, which links whatever text is between
     * the two — for when the sentence already reads "see the packages table".
     *
     * All four store nothing but the target's ID, so every visible part of the link is
     * derived at render time and a renumber or a rename is picked up for free. */
    var TOKEN = /\{\{(\/?)(b|i|c|br|(?:ref|refn|reft):[A-Za-z0-9:._-]+|ref)\}\}/g;
    var REF_TAG = /^(ref|refn|reft):(.+)$/;
    var MARK = { b: '**', i: '*', c: '`' };
    /** What a resolved reference reads as, per token. */
    var REF_READING = { ref: 'label', refn: 'numberLabel', reft: 'titleLabel' };

    /* REF-2: a term that links itself wherever it is written.
     *
     * A control is named in prose ("AHG-001 is met by …"), in a Rationale cell and in
     * the Control column of every register table. Asking the author to insert a
     * cross-reference at each of those is asking them not to bother, so the mentions
     * are found rather than marked: a caller hands over the terms it knows about and
     * every occurrence becomes a link to that term's anchor.
     *
     * Applied to ALREADY-ESCAPED markdown, and that is deliberate. The link text has to
     * be the escaped form (a control called `AHG_001` must still print an underscore),
     * and matching on the escaped string is also what keeps this out of the way of the
     * escaper — one pass, one place, no second escaping route to get wrong.
     *
     * Terms are matched longest-first so `ISM-1416` is not eaten by a control called
     * `ISM-141`, and a match must not sit inside a longer word, or `AHG-0011` would be
     * linked as `AHG-001` with a stray `1` after it.
     */
    var WORDY = /[A-Za-z0-9]/;
    function autoLink(escaped, terms) {
      var s = String(escaped == null ? '' : escaped);
      if (!s || !terms || !terms.length) return s;
      var sorted = terms.slice().sort(function (a, b) { return String(b.text).length - String(a.text).length; });
      var out = '', i = 0;
      outer: while (i < s.length) {
        for (var t = 0; t < sorted.length; t++) {
          var term = String(sorted[t].text);
          if (!term) continue;
          if (s.substr(i, term.length) !== term) continue;
          var before = i > 0 ? s.charAt(i - 1) : '';
          var after = s.charAt(i + term.length) || '';
          // Not mid-word, and not already inside a link's label or destination.
          if (WORDY.test(before) || WORDY.test(after)) continue;
          if (before === '[' || before === '#' || after === ']') continue;
          out += '[' + term + '](#' + sorted[t].anchor + ')';
          i += term.length;
          continue outer;
        }
        out += s.charAt(i);
        i++;
      }
      return out;
    }

    /**
     * One paragraph of rich text -> markdown.
     *
     * Emphasis is BALANCED here, per paragraph. A hand-typed or half-deleted `{{b}}`
     * with no closing partner would otherwise emit a lone `**`, which pandoc reads as
     * emphasis running to the end of the block — one damaged token silently bolding
     * the rest of the document. So an unmatched close is dropped, a redundant re-open
     * is dropped, and anything still open at the end of the paragraph is closed. The
     * worst a broken token can do is affect the paragraph it sits in.
     */
    function richPara(p, opts) {
      var out = '', last = 0, m;
      var open = { b: false, i: false, c: false };
      // REF-2: literal prose is the only place a control mention can be found — never
      // inside a code span (taken whole below) and never inside a reference's own label.
      /* RTX-2: the same writer serves a paragraph and a TABLE CELL.
       *
       * The two differ in exactly two places and in nothing else: what escaping the
       * literal text takes (a cell marks long identifiers so they can wrap — BRK-1), and
       * what a line break is written as (a cell's lines are separated by CELL_BREAK, a
       * paragraph's by a newline). Everything between — the emphasis balancing, the code
       * spans, the references, the trailing-break rule — is the same question with the
       * same answer, so it is answered once. */
      var escape = opts.cell ? cellText : text;
      var lit = function (s) { return autoLink(escape(s), opts.linkTerms); };
      TOKEN.lastIndex = 0;
      while ((m = TOKEN.exec(p)) !== null) {
        out += lit(p.slice(last, m.index));
        var close = m[1] === '/', tag = m[2];
        if (tag === 'c' && !close) {
          // A code span is taken WHOLE rather than as an open/close pair, because the
          // text inside it must not be escaped — emitting `` `a\_b` `` puts a visible
          // backslash in the PDF (\texttt{a\textbackslash{}\_b}). Taking the run in one
          // piece also lets code() size the fence against any backticks inside it.
          var at = p.indexOf('{{/c}}', TOKEN.lastIndex);
          var inner = at === -1 ? p.slice(TOKEN.lastIndex) : p.slice(TOKEN.lastIndex, at);
          out += code(inner);
          last = at === -1 ? p.length : at + 6;
          TOKEN.lastIndex = last;
          continue;
        }
        if (MARK[tag] && tag !== 'c') {
          // `close === open[tag]` is the balanced case in both directions: closing
          // something open, or opening something closed. Anything else is noise.
          if (close === open[tag]) { open[tag] = !close; out += MARK[tag]; }
        } else if (tag === 'br') {
          // Emitted as a bare newline and turned into a hard break by the pass below,
          // so there is exactly one place that decides what a line break looks like.
          out += '\n';
        } else if (REF_TAG.test(tag) && !close) {
          var bits = REF_TAG.exec(tag);
          var r = opts.resolveRef ? opts.resolveRef(bits[2]) : null;
          /* REF-1: a reference may carry its own words.
           *
           * `{{ref:ID}}see the packages table{{/ref}}` links what is between the two,
           * which is what the designer gets when text was selected before the button was
           * pressed. The inner run is taken WHOLE, like a code span, because it is the
           * link's label — an emphasis token inside it would have to be balanced against
           * a closing brace that belongs to the reference, and a half-formatted label is
           * not worth the machinery. */
          var at = p.indexOf('{{/ref}}', TOKEN.lastIndex);
          var wrapped = at === -1 ? null : p.slice(TOKEN.lastIndex, at);
          if (wrapped !== null) { last = at + 8; TOKEN.lastIndex = last; }
          // An unresolvable reference is STATED, never dropped: a dangling link in a
          // report is a finding, and a silently empty one is a worse finding.
          if (!r) {
            out += wrapped !== null ? lit(wrapped) + ' **\\[missing reference\\]**' : '**\\[missing reference\\]**';
          } else {
            var shown = wrapped !== null ? wrapped : String(r[REF_READING[bits[1]]] || r.label || '');
            out += '[' + escape(shown) + '](#' + r.anchor + ')';
          }
          if (wrapped !== null) continue;
        }
        last = m.index + m[0].length;
      }
      out += lit(p.slice(last));
      /* A single newline inside a paragraph is a deliberate line break — the box is a
       * plain textarea, so it is the only way to ask for one. Trailing backslash is
       * pandoc's hard break; a blank line already split the paragraph above.
       *
       * BR-1: a trailing break is a break like any other, and it needs a line to start.
       *
       * D-037 dropped them, because `\` with nothing after it is not a hard break to
       * pandoc — it reads the backslash as a literal and prints one. Dropping the break
       * also threw away the blank line the writer had asked for, which is why a spacer
       * at the foot of a title page did nothing. So the break is KEPT and given an empty
       * line to land on: one non-breaking space, which pandoc writes as `~` and which
       * occupies a line without putting a mark on the page. The lone backslash D-037 was
       * about never appears, because the last line is now the spacer rather than a break.
       *
       * Emphasis is closed BEFORE the trailing run rather than after it, or the closing
       * `**` would land on a line of its own below the break it was meant to close.
       */
      var tail = (/\n+$/.exec(out) || [''])[0];
      if (tail) out = out.slice(0, out.length - tail.length);
      ['i', 'b'].forEach(function (t) { if (open[t]) out += MARK[t]; });
      if (tail) out += tail + BLANK_LINE;
      /* RTX-2: a hard break is a trailing backslash in BOTH forms. What differs is the
       * separator that follows it — a newline in a paragraph, a CELL_BREAK in a cell,
       * which gridTable turns into a line of its own inside the cell. Without the
       * backslash pandoc folds a cell's consecutive lines into one paragraph, which is
       * why a line break typed into a cell used to do nothing at all on the page. */
      return out.split('\n').join('\\' + (opts.cell ? CELL_BREAK : '\n'));
    }

    /* BR-1: what a trailing line break lands on — a line that exists and prints nothing.
     * U+00A0 rather than a space, because a line of ordinary whitespace is stripped by
     * every markdown reader there is; a non-breaking space is CONTENT, and pandoc writes
     * it as `~`. */
    var BLANK_LINE = String.fromCharCode(0xA0);

    /**
     * Render rich text to markdown.
     * @param {string} s  the stored token text
     * @param {{resolveRef?:(id:string)=>?{label:string,numberLabel:string,titleLabel:string,anchor:string},
     *          linkTerms?:Array<{text:string,anchor:string}>}} [opts]
     * @returns {string}
     */
    function rich(s, opts) {
      opts = opts || {};
      return String(s == null ? '' : s).split(/\n{2,}/)
        .map(function (p) { return richPara(p, opts); })
        .filter(function (p) { return p.length; })
        .join('\n\n');
    }

    /**
     * RTX-2: the same rich text, written into a TABLE CELL.
     *
     * A hand-authored table's cells hold the same token markup a paragraph does, so bold,
     * italic, code, line breaks and cross-references work in a cell exactly as they do
     * above it. What a cell cannot have is markdown BLOCKS, so a blank line — a paragraph
     * in a paragraph box — is written as the blank line inside a cell that gridTable and
     * pandoc both already understand: two CELL_BREAKs.
     *
     * @param {string} s @param {Object} [opts] as rich(), minus the paragraph structure
     */
    function richCell(s, opts) {
      var o = {};
      Object.keys(opts || {}).forEach(function (k) { o[k] = opts[k]; });
      o.cell = true;
      return String(s == null ? '' : s).split(/\n{2,}/)
        .map(function (p) { return richPara(p, o); })
        .filter(function (p) { return p.length; })
        .join(CELL_BREAK + CELL_BREAK);
    }

    /** The plain-text reading of a token string — for previews, summaries and titles. */
    function plain(s) {
      return String(s == null ? '' : s).replace(TOKEN, function (m0, close, tag) {
        return (!close && REF_TAG.test(tag)) ? '→' : tag === 'br' ? ' ' : '';
      });
    }

    // ---- document assembly ---------------------------------------------------

    /** Join blocks with exactly one blank line, dropping empties. Deterministic. */
    function join(blocks) {
      return (blocks || []).filter(function (b) { return b != null && String(b).length; })
        .map(function (b) { return String(b).replace(/\s+$/, ''); }).join('\n\n');
    }

    /**
     * A YAML metadata block for pandoc. Values are emitted as double-quoted scalars
     * with only `\` and `"` escaped, which is the whole of YAML's double-quoted
     * escaping rule — the markdown escaping above must NOT be applied here, because
     * this text is consumed by the YAML parser and never by the markdown reader.
     * @param {Array<{key:string,value:*}>} entries  ordered; arrays emit as lists,
     *        a value of `{block:string}` emits as a literal block scalar
     */
    function yaml(entries) {
      function scalar(v) { return '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }
      var lines = ['---'];
      (entries || []).forEach(function (e) {
        if (e.value == null || e.value === '') return;
        if (Array.isArray(e.value)) {
          if (!e.value.length) return;
          lines.push(e.key + ':');
          e.value.forEach(function (v) { lines.push('  - ' + scalar(v)); });
        } else if (e.value && e.value.block != null) {
          if (!String(e.value.block).trim()) return;
          lines.push(e.key + ': |');
          String(e.value.block).split('\n').forEach(function (l) { lines.push('  ' + l); });
        } else if (typeof e.value === 'boolean' || typeof e.value === 'number') {
          lines.push(e.key + ': ' + e.value);
        } else {
          lines.push(e.key + ': ' + scalar(e.value));
        }
      });
      lines.push('---');
      return lines.join('\n');
    }

    /**
     * Slugify to a pandoc-legal anchor. Anchors are DERIVED FROM IDS, never from
     * titles — that is what lets a cross-reference survive a rename (see App.doc).
     */
    function anchor(id) {
      return String(id == null ? '' : id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
    }

    /**
     * Which characters in a string WOULD be escaped — what the designer shows under a
     * paragraph box so the author can see the transformation rather than be surprised
     * by it in the PDF.
     * @returns {string[]} the distinct hostile characters present, in first-seen order
     */
    function hostileChars(s) {
      var seen = {}, out = [];
      String(s == null ? '' : s).replace(TOKEN, '').replace(HOSTILE, function (ch) {
        if (!seen[ch]) { seen[ch] = 1; out.push(ch); }
        return ch;
      });
      return out;
    }

    App.md = {
      text: text, latex: latex, code: code, cell: cell, CELL_BREAK: CELL_BREAK,
      // BRK-1: which space-free runs get marked so they can break on the page.
      isLongIdentifier: isLongIdentifier, IDENT_MIN: IDENT_MIN,
      heading: heading, para: para, rule: rule, pageBreak: pageBreak, rawLatex: rawLatex, centred: centred,
      // SPC-1: vertical space as a length — between blocks, and inside a table row.
      vspace: vspace, rowStrut: rowStrut, mmLen: mmLen, MAX_MM: MAX_MM,
      table: table, pipeTable: pipeTable, gridTable: gridTable,
      // TW-1 (column widths) / TBS-1 (header + first-column styling) / HUM-1 (values)
      widthsFor: widthsFor, autoWidths: autoWidths, wrapLine: wrapLine, WIDTH_BUDGET: WIDTH_BUDGET,
      HEAD_SHADE_OPEN: HEAD_SHADE_OPEN, HEAD_SHADE_CLOSE: HEAD_SHADE_CLOSE, COL_SHADE: COL_SHADE,
      HEAD_CELL_SHADE: HEAD_CELL_SHADE,
      human: human, humanInline: humanInline, HUMAN_EMPTY: HUMAN_EMPTY,
      rich: rich, richCell: richCell, cellText: cellText, plain: plain, TOKEN: TOKEN, REF_TAG: REF_TAG,
      // D-036: exposed so a test can assert where a wrap is allowed to land.
      _safeCut: safeCut,
      // REF-2: turn every mention of a known term into a link to it.
      autoLink: autoLink,
      join: join, yaml: yaml, anchor: anchor, hostileChars: hostileChars
    };
  })(App);
  /* =============================================================================
   * MODULE: App.docFormat  — FMT-1..FMT-4: named formatting profiles
   * PURPOSE: Everything about how the finished document PRESENTS itself — heading
   *          styling per level, page size and margins, page numbers, table of
   *          contents — as a named, saveable, exportable profile. Emits the pandoc
   *          YAML metadata block (and the LaTeX preamble inside it) that carries
   *          those choices through to the PDF.
   * PURITY:  pure. Same profile in, same bytes out.
   * DEPENDS: App.md
   * INVARIANTS: the built-in profile is never mutated in place — editing it
   *             duplicates it first, so a project can always be read against a
   *             known-good baseline.
   * ============================================================================= */
  (function (App) {
    'use strict';
    var MD = App.md;

    /* -------------------------------------------------------------------------
     * Why the formatting lives in the .md at all.
     *
     * Markdown has no opinion about margins. Pandoc does: a YAML metadata block at
     * the top of the file sets document variables, and `header-includes` injects raw
     * LaTeX into the preamble. That is the only honest way to make "25mm margins,
     * numbered headings, page numbers bottom-centre" mean something once the file
     * leaves this tool — so a profile is compiled to exactly those two things and
     * nothing in the body is styled.
     *
     * Heading styling goes through `titlesec` because it is the one package that
     * restyles \section..\paragraph without redefining the class. Section NUMBERS
     * are supplied by App.doc, not by LaTeX (`numbersections` stays off), so that
     * what the preview shows, what the .md contains and what the PDF prints are the
     * same string — and so a cross-reference can name a number that actually exists.
     * ---------------------------------------------------------------------- */

    var PAPERS = ['a4', 'letter', 'a5', 'legal'];
    /* HDR-1: `page.numberPosition` is a MIGRATION path now, not a setting.
     *
     * It offered five fixed answers to "where does the page number go", and the header
     * and footer offer six slots you can put anything in — including the page number.
     * Two mechanisms competing for the same three positions is how a document ends up
     * with the number printed twice, so this one is read once, on load, into the slots
     * it corresponds to, and then dropped (see normalise).
     */
    var NUMBER_POSITIONS = [
      { value: 'none', label: 'No page numbers' },
      { value: 'footer-centre', label: 'Footer, centred' },
      { value: 'footer-right', label: 'Footer, right' },
      { value: 'footer-outer', label: 'Footer, outer edge (double-sided)' },
      { value: 'header-right', label: 'Header, right' }
    ];
    /** Which slot of which set an old `numberPosition` names. */
    var NUMBER_SLOTS = {
      'footer-centre': ['footer', 'centre'],
      'footer-right': ['footer', 'right'],
      // The outer edge alternates with the binding, which a three-slot model cannot
      // express — the right-hand page is the common case and is where it lands.
      'footer-outer': ['footer', 'right'],
      'header-right': ['header', 'right']
    };
    /* HDR-1: the header and footer, as four sets of three slots.
     *
     * `HF_SETS` is the running pair plus the optional first-page pair; `HF_SLOTS` is
     * fancyhdr's own three positions. Listed once and iterated everywhere — normalise,
     * the preamble, the preview and the designer all walk the same two arrays, so a slot
     * cannot exist in one of them and not the others.
     */
    var HF_SETS = ['header', 'footer', 'firstHeader', 'firstFooter'];
    var HF_SLOTS = ['left', 'centre', 'right'];
    /** The fancyhdr position letter for one slot. */
    var HF_LETTER = { left: 'L', centre: 'C', right: 'R' };
    /* HDR-1: what a slot may say beyond its own words.
     *
     * Two markers, and they carry a `#` for a reason that was found rather than
     * reasoned about: the first cut used the bare words `page` and `pages`, and a
     * first-page header reading "Title page" came out as "Title 1". A reserved word that
     * is also an ordinary English word will be typed as an ordinary English word.
     *
     * `#page` is not prose, and `\b` at the end keeps `#pages` from being read as `#page`
     * followed by an `s`. Substituted BEFORE escaping, since `#` is one of the characters
     * the escaper neutralises — see slotParts, which is the one place either happens.
     */
    /* Braced, because TeX eats the space after a control word.
     *
     * `Page #page of #pages` compiled to `Page \thepage of \pageref{LastPage}`, and the
     * space between `\thepage` and `of` is consumed as part of reading the control word
     * — so the footer printed "Page 1of 7". Measured in a built PDF, which is the only
     * place it shows. A closing brace is not a control word, so the space after `}`
     * survives.
     */
    var HF_MACROS = { page: '{\\thepage}', pages: '{\\pageref{LastPage}}' };
    var HF_TOKEN = /#(pages|page)\b/g;

    /**
     * HDR-1: one slot split into literal runs and markers, so each half can be treated
     * the way it needs to be — the literals escaped, the markers replaced.
     * @returns {Array<{text:string}|{token:string}>}
     */
    function slotParts(text) {
      var s = String(text == null ? '' : text).trim();
      var out = [], last = 0, m;
      if (!s) return out;
      HF_TOKEN.lastIndex = 0;
      while ((m = HF_TOKEN.exec(s)) !== null) {
        if (m.index > last) out.push({ text: s.slice(last, m.index) });
        out.push({ token: m[1] });
        last = m.index + m[0].length;
      }
      if (last < s.length) out.push({ text: s.slice(last) });
      return out;
    }
    // LaTeX sectioning commands, in the order App.doc's levels 1..4 map onto them.
    var LATEX_LEVELS = ['section', 'subsection', 'subsubsection', 'paragraph'];
    /* TTL-3: the styling row for App.doc's TITLE level. Stated here rather than read
     * from App.doc.TITLE_LEVEL because this module loads BEFORE that one (spec §14) —
     * the two must agree, and the self-test that asserts they do is the lock. */
    var TITLE_STYLE_LEVEL = 0;

    /* FNT-2: the body font, named as a LaTeX font PACKAGE rather than as a system font.
     *
     * Pandoc offers two ways to set a font and they are not interchangeable. `mainfont:`
     * takes the name of a font installed on the machine building the PDF, and only
     * XeTeX and LuaTeX understand it — a document carrying one fails, or silently
     * substitutes something else, anywhere that font is missing. This .md is meant to
     * travel. `fontfamily:` names a package from the TeX distribution itself, which
     * every engine can load and which tectonic fetches on demand, so the file carries
     * its own font wherever it goes.
     *
     * Hence a FIXED LIST: the value reaches LaTeX as a package name, and a package that
     * does not exist is a hard compile failure with an unhelpful error, so a profile
     * naming anything not in this table falls back to the default (see normalise).
     * That is also what keeps the value safe to interpolate into the preview CSS.
     *
     * `sans: true` marks the sans-serif packages. Loading one of those sets \sfdefault
     * and nothing else — the body text would stay in the roman default — so the
     * preamble switches \familydefault as well. See preamble().
     *
     * `css` is the nearest browser stack, for the preview. Substituting a screen font
     * for a metal one is an approximation and is meant to be; what it gets right is the
     * shape class — serif against sans, wide against narrow — which is the question the
     * preview is actually being asked.
     */
    var FONTS = [
      { value: '', label: 'Default (Latin Modern)',
        css: '"Latin Modern Roman", "CMU Serif", Cambria, Georgia, "Times New Roman", serif' },
      { value: 'tgtermes', label: 'Times (TeX Gyre Termes)',
        css: '"Nimbus Roman", "Times New Roman", Times, serif' },
      { value: 'tgpagella', label: 'Palatino (TeX Gyre Pagella)',
        css: '"Palatino Linotype", Palatino, "URW Palladio L", "Book Antiqua", Georgia, serif' },
      { value: 'tgschola', label: 'Century Schoolbook (TeX Gyre Schola)',
        css: '"Century Schoolbook", "New Century Schoolbook", "URW Schoolbook L", Georgia, serif' },
      { value: 'tgbonum', label: 'Bookman (TeX Gyre Bonum)',
        css: '"Bookman Old Style", "URW Bookman L", Bookman, Georgia, serif' },
      { value: 'charter', label: 'Charter',
        css: 'Charter, "Bitstream Charter", XCharter, Georgia, serif' },
      { value: 'libertine', label: 'Linux Libertine',
        css: '"Linux Libertine O", "Linux Libertine", "Libertinus Serif", Georgia, serif' },
      { value: 'tgheros', label: 'Helvetica (TeX Gyre Heros)', sans: true,
        css: 'Helvetica, "Nimbus Sans", "Helvetica Neue", Arial, sans-serif' },
      { value: 'tgadventor', label: 'Avant Garde (TeX Gyre Adventor)', sans: true,
        css: '"Century Gothic", "URW Gothic", "Avant Garde", "Trebuchet MS", sans-serif' },
      { value: 'sourcesanspro', label: 'Source Sans Pro', sans: true,
        css: '"Source Sans Pro", "Source Sans 3", "Segoe UI", Helvetica, sans-serif' }
    ];

    /**
     * SEC-4: the heading levels whose own styling starts a new page.
     *
     * The profile says this per LEVEL — a house rule, "every H1 starts a page" — and it
     * reaches the PDF as titlesec's `\sectionbreak`, which is LaTeX's hook and invisible
     * to everything else. Three places need to know about it and could not: App.doc,
     * which must not emit a second break for a section whose level already breaks; the
     * preview, which paginates and would otherwise never break at all; and the designer,
     * which should not offer a per-section switch for something already switched on.
     * @returns {Object<number,boolean>} keyed by App.doc's level number
     */
    function levelBreaks(profile) {
      var out = {};
      normalise(profile).levels.forEach(function (lv) {
        if (lv.pageBreakBefore) out[lv.level] = true;
      });
      return out;
    }

    /** The FONTS row a profile has chosen; the default row for anything unrecognised. */
    function font(profile) {
      var want = String((profile && profile.page && profile.page.fontFamily) || '');
      return FONTS.filter(function (f) { return f.value === want; })[0] || FONTS[0];
    }

    /** FMT-1: the shipped baseline. Deliberately plain, and sized for a report that
     *  will be read on paper as often as on screen. */
    var STANDARD = {
      id: 'standard',
      name: 'Standard',
      builtin: true,
      page: {
        paper: 'a4', marginTop: '25mm', marginBottom: '25mm',
        marginLeft: '25mm', marginRight: '25mm',
        fontSize: '11pt', lineSpacing: 1.15,
        // FNT-2: blank is the default font, not a missing setting — the shipped profile
        // adds no `fontfamily` to the YAML at all, so pandoc's own default stands.
        fontFamily: '',
        // FNT-4: the body text's own weight and slope. A heading sets its own (see
        // levelFont) and a table sets its own (see fontPreamble), so these are exactly
        // "the prose", which is what the Fonts table calls Regular.
        bold: false, italic: false,
        // CODE-1: the background a code span wears. Blank is no shading at all.
        codeShade: '#f2f2f2'
      },
      headings: { numbered: true, clampSkips: true },
      /* TTL-3: the TITLE has a row of its own, and it is the first one.
       *
       * A title (App.doc's `T` level) prints at the top level and takes no number. Until
       * now it also took H1's styling, because both emit a `#` and titlesec styles the
       * COMMAND — so a title page and a first section could not be set differently even
       * though nobody wants them the same.
       *
       * It ships identical to H1, so no existing document moves until the row is edited,
       * and normalise() falls back POSITIONALLY for a profile written before this row
       * existed — which lands a saved profile's own H1 styling on its title, i.e. exactly
       * what that profile was already producing.
       */
      levels: [
        { level: 0, size: 18, leading: 22, bold: true, italic: false, pageBreakBefore: true, spaceBefore: 0, spaceAfter: 10 },
        { level: 1, size: 18, leading: 22, bold: true, italic: false, pageBreakBefore: true, spaceBefore: 0, spaceAfter: 10 },
        { level: 2, size: 14, leading: 17, bold: true, italic: false, pageBreakBefore: false, spaceBefore: 14, spaceAfter: 6 },
        { level: 3, size: 12, leading: 15, bold: true, italic: false, pageBreakBefore: false, spaceBefore: 12, spaceAfter: 5 },
        { level: 4, size: 11, leading: 14, bold: true, italic: true, pageBreakBefore: false, spaceBefore: 10, spaceAfter: 4 }
      ],
      /* HDR-1: the running header and footer, each configured on its own.
       *
       * Three slots a side, because that is what fancyhdr offers and what a document
       * actually needs — a classification centred, a document title left, a page number
       * right. `page` in any slot is replaced by the page number, so the old
       * `numberPosition` picker becomes one of the things you can type rather than a
       * separate mechanism competing for the same slots (see headerFooterPreamble).
       *
       * `firstDifferent` gives page 1 its own set. A title page usually wants no running
       * header at all, and until now the only way to get one was to have none anywhere.
       */
      headerFooter: {
        firstDifferent: false,
        header: { left: '', centre: '', right: '' },
        footer: { left: '', centre: '#page', right: '' },
        firstHeader: { left: '', centre: '', right: '' },
        firstFooter: { left: '', centre: '', right: '' }
      },
      // TOC-2: `entrySpacing` is the gap between one contents line and the next, in
      // points. LaTeX's own is 1em plus stretch between top-level entries, which on a
      // report whose sections are mostly one line each reads as a gappy, half-empty
      // page. Nested entries take half of it, as they do in the class.
      toc: { include: true, depth: 3, entrySpacing: 2 },
      // TBS-1: what a styled header row / first column LOOKS like is a house decision,
      // so it belongs to the profile. WHICH tables wear it is a per-table decision and
      // lives with the table (report.tableStyles / a table part's own flags).
      tables: {
        centre: false,
        // CAP-2: the caption's own alignment, independent of the table's. A caption
        // shorter than the table is centred by LaTeX anyway; one that wraps is not, and
        // that inconsistency is what this switch settles.
        captionCentre: false,
        // CAP-3: where the caption sits, and how far it sits from the table. Below is
        // the default because it is where the preview has always drawn it, and because
        // a caption under the thing it names is what a reader scanning a page expects.
        captionPosition: 'below', captionSkip: 4,
        // FNT-1: a table usually wants to be set smaller than the prose around it, and
        // its header row bigger than its body. Blank means "the document size", so the
        // shipped profile still sets everything at one size until told otherwise.
        // FNT-4: a caption is a third size, for the same reason the other two are —
        // it is a distinct kind of text and was the only one with no row of its own.
        fontSize: '', headFontSize: '', captionFontSize: '',
        /* FNT-4: weight and slope for the three kinds of table text, document-wide.
         *
         * These are DIFFERENT in kind from `head.bold` below, which is why they are not
         * there. `head`/`firstColumn` are the look a table OPTS IN to, per section; these
         * are what every table is set in, like a font size. Since a header row is bold in
         * essentially every house style, `headBold` ships on — and `tableStyle()` no
         * longer hands emphasis to the opt-in, so ticking "style the header row" adds the
         * shading and nothing else. One switch per question.
         */
        bold: false, italic: false,
        headBold: true, headItalic: false,
        captionBold: false, captionItalic: false,
        /* FNT-5: the first column's weight and slope, on the same footing as the header
         * row's — a kind of text the document sets, not a thing a section opts into.
         *
         * They lived on `firstColumn` below, which meant they only reached the sections
         * that had ticked "style the first column", and the shade they arrived with was
         * #F2F2F2 — a 5% grey nobody can see on a printed page. Between the two, opting a
         * section in appeared to do nothing at all. The weight is document-wide now (one
         * switch per question, as FNT-4 settled for the header row) and what opting in
         * buys is the SHADE, which is genuinely a per-section decision.
         *
         * Shipped OFF, unlike `headBold`: a bold header row is every house style, a bold
         * first column in every table is a choice, and the shipped profile had never
         * actually delivered one outside the sections that opted in. A profile saved
         * before this that DID ask for one keeps it — see normalise. */
        firstColBold: false, firstColItalic: false,
        /* FNT-6: and its SIZE, which it had none of until now.
         *
         * Blank means the table body's size, on the same rule the other three sizes
         * follow. It reaches the page as a macro called at the head of each first-column
         * body cell (see App.md's COL_FONT), because markdown emphasis — which is how
         * the weight above travels — cannot carry a size. */
        firstColFontSize: '',
        head: { shade: '#D9E2F3' },
        // A shade a reader can actually see. #F2F2F2 measured under 5% away from white,
        // which on paper is nothing at all.
        firstColumn: { shade: '#E7E6E6' }
      }
    };

    function clone(o) { return JSON.parse(JSON.stringify(o)); }

    /** A fresh copy of the baseline — the starting point for any new profile. */
    function standard() { return clone(STANDARD); }

    /**
     * Fill a partial profile out against the baseline, so a profile written by an
     * older version of the tool (or hand-edited in an exported file) is usable rather
     * than a load failure. Unknown keys are dropped, not carried.
     * @param {Object} p @returns {Object} a complete profile
     */
    function normalise(p) {
      var base = standard();
      p = p || {};
      var out = {
        id: String(p.id || 'standard'),
        name: String(p.name || base.name),
        page: Object.assign({}, base.page, p.page || {}),
        headings: Object.assign({}, base.headings, p.headings || {}),
        levels: base.levels.map(function (lv, i) {
          var got = (p.levels || []).filter(function (x) { return x && x.level === lv.level; })[0] || (p.levels || [])[i];
          return Object.assign({}, lv, got || {}, { level: lv.level });
        }),
        toc: Object.assign({}, base.toc, p.toc || {}),
        tables: Object.assign({}, base.tables, p.tables || {}),
        headerFooter: Object.assign({}, base.headerFooter, p.headerFooter || {})
      };
      // HDR-1: the four slot sets merge field by field, on the same rule as the table
      // styles — a profile that pins only the footer's centre keeps the rest.
      HF_SETS.forEach(function (k) {
        out.headerFooter[k] = Object.assign({}, base.headerFooter[k], (p.headerFooter || {})[k] || {});
        HF_SLOTS.forEach(function (s) { out.headerFooter[k][s] = String(out.headerFooter[k][s] == null ? '' : out.headerFooter[k][s]); });
      });
      out.headerFooter.firstDifferent = out.headerFooter.firstDifferent === true;
      /* HDR-1: an older profile's page-number position, read into the slots.
       *
       * Only when the profile carries no header/footer of its own — a profile saved
       * since has already said where everything goes, and letting a leftover field
       * overwrite that would move the number back to where it used to be. The default
       * footer-centre lands exactly where the shipped profile already puts `page`, so
       * an untouched profile is unchanged by this.
       */
      if (!p.headerFooter && p.page && p.page.numberPosition !== undefined) {
        HF_SETS.forEach(function (k) { HF_SLOTS.forEach(function (s) { out.headerFooter[k][s] = ''; }); });
        var slot = NUMBER_SLOTS[p.page.numberPosition];
        if (slot) out.headerFooter[slot[0]][slot[1]] = '#page';
      }
      delete out.page.numberPosition;
      if (p.builtin) out.builtin = true;
      if (PAPERS.indexOf(out.page.paper) === -1) out.page.paper = base.page.paper;
      // FNT-2: the font is a LaTeX package name on its way to the preamble and a CSS
      // family on its way to the preview. Both are places where an unchecked string
      // does damage, so an unrecognised one becomes the default here, once, rather
      // than being guarded at each of the three places that read it.
      out.page.fontFamily = font(out).value;
      // CODE-1: a colour on its way to both \definecolor and a stylesheet, on the same
      // rule as the table shades — malformed means none rather than a compile error.
      out.page.codeShade = normaliseShade(out.page.codeShade);
      // CAP-3: anything but 'above' is 'below', which is the default and the safe read.
      out.tables.captionPosition = out.tables.captionPosition === 'above' ? 'above' : 'below';
      // TBS-1: the two table styles merge FIELD BY FIELD. A profile that pins only
      // `firstColumn.bold` must keep the baseline's shade rather than lose it to a
      // shallow overwrite — the same rule the levels above already follow.
      ['head', 'firstColumn'].forEach(function (k) {
        out.tables[k] = Object.assign({}, base.tables[k], (p.tables && p.tables[k]) || {});
        out.tables[k].shade = normaliseShade(out.tables[k].shade);
      });
      /* FNT-4: a profile written before the header row's weight moved out of the opt-in.
       *
       * `tables.head.bold` used to be BOTH "what a styled header looks like" and the only
       * way a header row could be bold at all. It is now a document-wide setting
       * (`tables.headBold`), so a saved profile that pinned the old field keeps the
       * appearance it already had rather than silently losing its bold. Read only when
       * the new field is absent, so a profile that has been edited since is not overruled
       * by a leftover.
       */
      var oldHead = (p.tables && p.tables.head) || {};
      if ((!p.tables || p.tables.headBold === undefined) && oldHead.bold !== undefined) out.tables.headBold = !!oldHead.bold;
      if ((!p.tables || p.tables.headItalic === undefined) && oldHead.italic !== undefined) out.tables.headItalic = !!oldHead.italic;
      delete out.tables.head.bold;
      delete out.tables.head.italic;
      /* FNT-5: the same move, one round later, for the first column.
       *
       * A profile saved before this carries `tables.firstColumn.bold` and no
       * `firstColBold`, and it must keep the appearance it already had rather than
       * silently losing it. Read only when the new field is absent, so a profile edited
       * since is not overruled by a leftover — exactly the rule above.
       */
      var oldCol = (p.tables && p.tables.firstColumn) || {};
      if ((!p.tables || p.tables.firstColBold === undefined) && oldCol.bold !== undefined) out.tables.firstColBold = !!oldCol.bold;
      if ((!p.tables || p.tables.firstColItalic === undefined) && oldCol.italic !== undefined) out.tables.firstColItalic = !!oldCol.italic;
      delete out.tables.firstColumn.bold;
      delete out.tables.firstColumn.italic;
      return out;
    }

    /** A shade is `#rrggbb` or nothing. Anything else is dropped rather than passed to
     *  LaTeX, where a malformed colour is a compile error rather than a wrong colour. */
    function normaliseShade(v) {
      var s = String(v == null ? '' : v).trim();
      if (!s) return '';
      if (s.charAt(0) !== '#') s = '#' + s;
      return /^#[0-9A-Fa-f]{6}$/.test(s) ? s.toLowerCase() : '';
    }

    /** Every profile available to a project: the built-in first, then the saved ones. */
    function list(project) {
      var saved = ((project && project.report && project.report.formats) || []).map(normalise);
      return [standard()].concat(saved.filter(function (f) { return f.id !== 'standard'; }));
    }

    /** FMT-2: the profile the project is currently set to use. Falls back to the
     *  built-in when the saved id no longer resolves — a deleted profile must never
     *  block generation. */
    function resolve(project) {
      var want = (project && project.report && project.report.formatId) || 'standard';
      var found = list(project).filter(function (f) { return f.id === want; })[0];
      return found || standard();
    }

    // ---- compilation to pandoc -----------------------------------------------

    /** `12` -> `12pt`; passes an already-suffixed string through untouched. */
    function pt(v, dflt) {
      if (v == null || v === '') return dflt;
      var s = String(v).trim();
      return /^[\d.]+$/.test(s) ? s + 'pt' : s;
    }
    /** A length for `geometry`; bare numbers are read as millimetres. */
    function len(v, dflt) {
      if (v == null || v === '') return dflt;
      var s = String(v).trim();
      return /^[\d.]+$/.test(s) ? s + 'mm' : s;
    }

    /** The font selection one level's styling implies. */
    function levelFont(lv) {
      return '\\normalfont\\fontsize{' + pt(lv.size, '12pt') + '}{' + pt(lv.leading || (Number(lv.size) + 3), '15pt') + '}\\selectfont' +
        (lv.bold ? '\\bfseries' : '\\mdseries') + (lv.italic ? '\\itshape' : '\\upshape');
    }

    /**
     * TTL-3: one level's styling as a MACRO the body can call, rather than as a
     * preamble declaration.
     *
     * A title and an H1 are the same LaTeX command — both are `\section`, because both
     * are a `#` — so titlesec cannot tell them apart and a single `\titleformat` has to
     * serve both. The way out is to restyle `\section` in the document: App.doc emits
     * `\chTitleStyle` before a title's heading and `\chSectionStyle` after it, so the
     * one command wears two looks.
     *
     * Deliberately NOT wrapped in `\begingroup`/`\endgroup`, which would be the obvious
     * way to scope it: `\section` ends by putting the indent suppression for the
     * paragraph after it into `\everypar`, which is a LOCAL assignment — closing a group
     * straight after the heading throws it away, and the first paragraph under a title
     * would then be indented where the same paragraph under an H1 is not. Two plain
     * declarations either side leave the heading itself at the outer level, exactly as
     * an ordinary heading is.
     */
    function styleMacro(name, lv, centred) {
      return '\\newcommand{\\' + name + '}{' +
        '\\titleformat{\\section}{' + levelFont(lv) + (centred ? '\\centering' : '') + '}{}{0pt}{}' +
        '\\titlespacing*{\\section}{0pt}{' + pt(lv.spaceBefore, '0pt') + '}{' + pt(lv.spaceAfter, '0pt') + '}' +
        // \def rather than \newcommand: this runs in the body, where \sectionbreak may
        // already carry whichever of the two set it last.
        '\\def\\sectionbreak{' + (lv.pageBreakBefore ? '\\clearpage' : '') + '}}';
    }

    /* CTR-1: a centred heading is a `\titleformat` with `\centering` in it, NOT a
     * heading inside a `center` environment.
     *
     * The environment was the obvious way and it was wrong twice over, both measurable
     * on the page:
     *
     *   * titlesec typesets a heading's text in a box of its own, and `\centering` set
     *     outside that box does not reach inside it — so the heading came out
     *     JUSTIFIED across the full measure rather than centred, which is what a
     *     centred title page actually looked like;
     *   * `\begin{center}` contributes its `\topsep` glue BEFORE `\section` runs, and
     *     `\section` is where `\sectionbreak` fires. With the Title level asking for a
     *     page break (the shipped profile does), that glue landed on a page of its own
     *     and `\clearpage` then ended it — an entirely blank page ahead of the section.
     *
     * Putting `\centering` in the format argument is where titlesec expects alignment,
     * and it leaves the break machinery exactly where it was. One macro per level, named
     * by ordinal rather than by LaTeX command so App.doc does not have to know the
     * mapping (it already emits \chTitleStyle by name, on the same reasoning).
     */
    var LEVEL_WORDS = ['One', 'Two', 'Three', 'Four'];
    function centreMacros(lv) {
      var cmd = LATEX_LEVELS[lv.level - 1], word = LEVEL_WORDS[lv.level - 1];
      if (!cmd || !word) return [];
      function fmt(centred) {
        return '\\titleformat{\\' + cmd + '}{' + levelFont(lv) + (centred ? '\\centering' : '') + '}{}{0pt}{}';
      }
      return ['\\newcommand{\\chCentre' + word + '}{' + fmt(true) + '}',
        '\\newcommand{\\chPlain' + word + '}{' + fmt(false) + '}'];
    }

    /* SPC-1: space above a HEADING, which is not the same problem as space between two
     * paragraphs.
     *
     * A `\vspace*` written before the heading is contributed to the page the heading is
     * leaving, not the one it is arriving on — and when the level starts a new page
     * (`\sectionbreak` is `\clearpage`, fired BY the heading, after our glue) the gap was
     * simply spent at the foot of the previous page and the heading came out flush with
     * the top margin. Which is exactly the case worth asking for: a signature page whose
     * heading sits two thirds of the way down.
     *
     * The same trap the CTR-1 comment above records, from the other side. The way out is
     * the same one this file uses everywhere: the document calls a macro by name and the
     * PROFILE decides what it means. A level that breaks does its own `\clearpage` first
     * and then eats the one titlesec is about to fire; a level that does not simply
     * leaves the glue.
     *
     * `\gdef\HOOK{\gdef\HOOK{...}}` is a one-shot: called once by this heading, it puts
     * the level's real break straight back for the next one. No group is opened, because
     * a group closed around a heading throws away the `\everypar` it set (see styleMacro).
     * `\titlespacing`'s own beforeskip cannot be used for this: LaTeX discards vertical
     * glue at the top of a page, which is the only place it would ever matter.
     */
    function gapMacro(name, hook, breaks) {
      return '\\newcommand{\\' + name + '}[1]{' + (breaks
        ? '\\clearpage\\vspace*{#1}\\gdef\\' + hook + '{\\gdef\\' + hook + '{\\clearpage}}'
        : '\\vspace*{#1}') + '}';
    }

    /** The `titlesec` block for one heading level. */
    function levelPreamble(lv) {
      // TTL-3: the title is not a sectioning command of its own — it is a `\section`
      // wearing another face, so it compiles to a macro rather than to a declaration.
      if (lv.level === TITLE_STYLE_LEVEL) {
        // CTR-1: a title gets a centred face too — a title page is the commonest thing
        // anybody centres, and it is the level they will have picked for it.
        // SPC-1: a title is a `\section`, so its break hook is `\sectionbreak` — but
        // whether it breaks is the TITLE level's own answer, not H1's.
        return [styleMacro('chTitleStyle', lv), styleMacro('chTitleStyleCentred', lv, true),
          gapMacro('chGapTitle', 'sectionbreak', !!lv.pageBreakBefore)];
      }
      var cmd = LATEX_LEVELS[lv.level - 1];
      if (!cmd) return [];
      var out = [
        // The empty {}{0pt}{} is deliberate: App.doc has already written the number
        // into the heading text, so LaTeX must not add a second one.
        '\\titleformat{\\' + cmd + '}{' + levelFont(lv) + '}{}{0pt}{}',
        '\\titlespacing*{\\' + cmd + '}{0pt}{' + pt(lv.spaceBefore, '0pt') + '}{' + pt(lv.spaceAfter, '0pt') + '}'
      ];
      if (lv.pageBreakBefore) out.push('\\newcommand{\\' + cmd + 'break}{\\clearpage}');
      // SPC-1: this level's "start further down the page", which has to know whether the
      // level breaks — see gapMacro.
      out.push(gapMacro('chGap' + LEVEL_WORDS[lv.level - 1], cmd + 'break', !!lv.pageBreakBefore));
      // The counterpart to \chTitleStyle: what a heading goes back to afterwards.
      if (lv.level === 1) out.push(styleMacro('chSectionStyle', lv));
      // CTR-1: the centred face for this level, and the plain one to go back to.
      return out.concat(centreMacros(lv));
    }

    /**
     * TBS-1: the two macros App.md's shading fences call, plus the colours behind them.
     *
     * `colortbl` rather than `\usepackage[table]{xcolor}` because pandoc's default
     * template has already loaded xcolor by the time `header-includes` is read, and a
     * second load with an option is an "Option clash" — a hard failure, measured on
     * pandoc 3.1.11 + tectonic, not guessed.
     *
     * `\chTblHeadShade` redefines `\toprule`, which is what pandoc emits immediately
     * before the header row of every longtable, so `\rowcolor` lands where colortbl
     * needs it — at the start of a row. It is only ever called inside a `\begingroup`
     * around one table (see App.md), so the redefinition cannot leak into the next one.
     *
     * Both macros are defined whatever the profile says, so a table that asks for
     * shading always compiles. A profile with no shade colour simply defines them as
     * no-ops rather than leaving the document referring to a macro that is not there.
     */
    function tablePreamble(f) {
      var t = (f && f.tables) || {};
      var headShade = (t.head && t.head.shade) || '';
      var colShade = (t.firstColumn && t.firstColumn.shade) || '';
      var out = ['\\usepackage{colortbl}'];
      if (headShade) out.push('\\definecolor{chTblHeadColour}{HTML}{' + headShade.slice(1).toUpperCase() + '}');
      if (colShade) out.push('\\definecolor{chTblColColour}{HTML}{' + colShade.slice(1).toUpperCase() + '}');
      // Opting in switches BOTH on: the `\toprule` redefinition, which colours the first
      // header row, and `\chTblHeadRow`, which a filter can put on the rest of them.
      out.push(headShade
        ? '\\newcommand{\\chTblHeadShade}{\\let\\chOldToprule\\toprule' +
          '\\renewcommand{\\toprule}{\\chOldToprule\\rowcolor{chTblHeadColour}}' +
          '\\renewcommand{\\chTblHeadRow}{\\rowcolor{chTblHeadColour}}}'
        : '\\newcommand{\\chTblHeadShade}{}');
      out.push(colShade
        ? '\\newcommand{\\chTblColShade}{\\cellcolor{chTblColColour}}'
        : '\\newcommand{\\chTblColShade}{}');
      /* FNT-6: the first column's own size, as the macro App.md's span calls.
       *
       * Defined whatever the profile says, for the reason the shading macros are: a
       * document that names a macro the preamble does not define is a compile error, and
       * an empty macro is a size that changes nothing. The leading is the same 1.2x the
       * row-font machinery uses, so a first column set smaller sets its wrapped lines
       * closer together as well, which is what a smaller size means.
       */
      var colSize = ptNum(t.firstColFontSize, 0);
      out.push(colSize
        ? '\\newcommand{\\chTblColFont}{\\fontsize{' + colSize + 'pt}{' +
          (Math.round(colSize * 1.2 * 100) / 100) + 'pt}\\selectfont}'
        : '\\newcommand{\\chTblColFont}{}');
      /* TBL-1: the header row's shade as a CELL colour as well as a row colour.
       *
       * `\chTblHeadShade` works by redefining `\toprule`, which pandoc emits once,
       * before the FIRST header row — so with a title row above the column headings it
       * coloured the title and left the headings white. `\rowcolor` cannot be reached
       * for the second row: it has to sit immediately after the `\\` that starts the
       * row, and everything this file can put there is inside a cell.
       *
       * `\cellcolor` can be inside a cell, and — measured, because it is the whole
       * question — it works from inside the `minipage` pandoc wraps a grid table's
       * header cells in. So the headings row is coloured cell by cell, which is the same
       * mechanism the first column has used since TBS-1.
       */
      out.push(headShade
        ? '\\newcommand{\\chTblHeadCell}{\\cellcolor{chTblHeadColour}}'
        : '\\newcommand{\\chTblHeadCell}{}');
      /* `\chTblHeadRow` is the same colour as a ROW rather than as cells, for a writer
       * that can put something at the start of a row — which markdown cannot, but a
       * pandoc filter that assembles the longtable itself can.
       *
       * It exists because `\cellcolor` takes no overhang (only `\columncolor` does), so
       * a cell-coloured row stops about 4.8pt short of the table's right rule — measured
       * at 300dpi on a built page. A `\rowcolor` covers the row edge to edge. Defined
       * unconditionally and empty by default, so a filter can emit it on every header
       * row without knowing whether this table asked for shading; `\chTblHeadShade`,
       * which is what a table opts in with, is what turns it on.
       */
      out.push('\\newcommand{\\chTblHeadRow}{}');
      // CAP-2 used to need `\usepackage{caption}` and `singlelinecheck=false` here, to
      // stop LaTeX centring a one-line caption and justifying a wrapped one. A caption
      // is an ordinary paragraph now (CAP-3), so its alignment is simply the alignment
      // of that paragraph and there is nothing to correct — see captionPreamble.
      return out.concat(fontPreamble(f));
    }

    /* FNT-1: a table's own font sizes, and why they are a preamble matter.
     *
     * `\fontsize` cannot be made global from inside a `\noalign` — it uses
     * `\afterassignment`, and `\global\fontsize` is an error (measured). What CAN be
     * flipped between rows is a MACRO, so the size travels as one: `\chRowFont` is
     * applied by every cell (pandoc writes `>{\raggedright\arraybackslash}` into every
     * column spec, so redefining `\raggedright` reaches every cell of every table), and
     * `\toprule` and `\midrule` — the rules pandoc puts either side of a header row —
     * flip which size it names.
     *
     * Document-wide rather than per-table because the sizes are a house decision, and
     * because doing it in the preamble means no flag has to be threaded through three
     * modules to reach App.md. `\midrule` appears only in tables and `\raggedright` only
     * in their cells, so nothing else is touched; with neither size set the macro is
     * empty and the preamble is unchanged.
     */
    /** FNT-4: the series/shape a weight-and-slope pair implies, always stated in full
     *  so a macro cannot inherit half its typography from wherever it is called. */
    function emph(bold, italic) {
      return (bold ? '\\bfseries' : '\\mdseries') + (italic ? '\\itshape' : '\\upshape');
    }

    function fontPreamble(f) {
      var t = f.tables || {};
      var body = ptNum(t.fontSize, 0), head = ptNum(t.headFontSize, 0);
      /* FNT-4: the row-font machinery now carries weight and slope as well as size, so
       * it is needed whenever any of those differ from the document's — and whenever the
       * DOCUMENT is bold or italic, because then a table has to say plainly that it is
       * not, or it would inherit the body's emphasis through \AtBeginDocument. */
      var emphasised = t.bold || t.italic || t.headBold || t.headItalic;
      if (!body && !head && !emphasised && !f.page.bold && !f.page.italic) return [];
      var base = ptNum(f.page.fontSize, 11);
      function sel(size, bold, italic) {
        var s = size || base;
        return '\\fontsize{' + s + 'pt}{' + (Math.round(s * 1.2 * 100) / 100) + 'pt}\\selectfont' + emph(bold, italic);
      }
      return [
        '\\newcommand{\\chTblHeadFont}{' + sel(head, t.headBold, t.headItalic) + '}',
        '\\newcommand{\\chTblBodyFont}{' + sel(body, t.bold, t.italic) + '}',
        '\\newcommand{\\chRowFont}{}',
        // DISTINCT names from the shading macro's `\chOldToprule`. That one re-lets its
        // saved rule per table, and if the two shared a name it would capture a macro
        // whose own body names it — an expansion that never terminates.
        '\\let\\chBaseRaggedright\\raggedright',
        '\\renewcommand{\\raggedright}{\\chBaseRaggedright\\chRowFont}',
        '\\let\\chBaseToprule\\toprule',
        '\\renewcommand{\\toprule}{\\chBaseToprule\\noalign{\\global\\let\\chRowFont\\chTblHeadFont}}',
        '\\let\\chBaseMidrule\\midrule',
        '\\renewcommand{\\midrule}{\\noalign{\\global\\let\\chRowFont\\chTblBodyFont}\\chBaseMidrule}'
      ];
    }

    /**
     * FMT-3: the whole LaTeX preamble a profile implies.
     * @param {Object} profile @param {{classification?:string}} [opts]
     */
    /* CODE-1: a shaded box behind a code span, without losing the ability to break one.
     *
     * A code span reaches LaTeX as `\texttt`, and the obvious way to shade it —
     * `\colorbox` — typesets its contents in an unbreakable hbox. Measured on
     * pandoc 3.1.11 + tectonic: a 64-character SHA-256 in a `\colorbox` runs 49pt past
     * the right margin, which is precisely the defect BRK-1 fixed by routing every
     * `\texttt` through `\seqsplit`. soul's `\hl` breaks only at spaces, which an
     * identifier has none of (37pt over), and `\hl` around `\seqsplit` is a hard error
     * ("Argument of \seqsplit has an extra }"). All three were built, not reasoned about.
     *
     * So the choice is made per span by the only thing in a position to judge it: the
     * typesetter, which knows how wide the run actually is. A span that fits takes the
     * shaded box; one that does not stays breakable and unshaded, because a background
     * painted across a line break reads worse than no background at all.
     */
    function codePreamble(f) {
      var shade = normaliseShade(f.page.codeShade);
      var plain = '\\renewcommand{\\texttt}[1]{\\chOriginalTexttt{\\seqsplit{#1}}}';
      if (!shade) return [plain];
      return [
        '\\definecolor{chCodeShade}{HTML}{' + shade.slice(1).toUpperCase() + '}',
        '\\newlength{\\chCodeWidth}',
        // \fboxsep is the box's padding. The default 3pt makes a shaded span in a table
        // cell sit visibly proud of the unshaded one above it.
        '\\newcommand{\\chCodeBox}[1]{{\\setlength{\\fboxsep}{1.5pt}\\colorbox{chCodeShade}{#1}}}',
        '\\renewcommand{\\texttt}[1]{%',
        '  \\settowidth{\\chCodeWidth}{\\chOriginalTexttt{#1}}%',
        '  \\ifdim\\chCodeWidth>' + CODE_SHADE_MAX + '\\linewidth',
        '    \\chOriginalTexttt{\\seqsplit{#1}}%',
        '  \\else',
        '    \\chCodeBox{\\chOriginalTexttt{#1}}%',
        '  \\fi}'
      ];
    }
    /* The test is against `\linewidth`, NOT `\columnwidth`, and the difference is the
     * whole of it: inside a table cell `\columnwidth` is still the width of the PAGE's
     * column, so measuring against it boxed `imsSettings.simSlot0.enabled` in a narrow
     * first column and ran it 38pt out of the cell (measured). `\linewidth` is the cell
     * inside a `p{}` column and the text block outside one, which is the question being
     * asked in both places: does this run fit where it is being set? */
    var CODE_SHADE_MAX = '0.95';

    /* CAP-3: the caption, as two macros the document wraps a paragraph in.
     *
     * Pandoc's own caption syntax puts the text INSIDE the longtable's first head —
     * verified by reading its LaTeX: `\caption{...}\tabularnewline` sits directly before
     * `\toprule`. That is why the caption printed above the table whichever side of the
     * table the markdown put it on, and no `\captionsetup` moves it, because its
     * position in the output is its position in the source. It also means LaTeX numbers
     * the table while this file numbers its own headings and cross-references: two
     * counters for one thing, kept in step only by both counting in the same order.
     *
     * So a caption stops being a pandoc caption and becomes an ordinary paragraph that
     * App.doc numbers, exactly as it numbers a heading. What is left for LaTeX is how it
     * LOOKS — the size, the alignment and the space on each side — which is these two
     * macros. The longtable skip on the side facing the caption is zeroed, or the gap a
     * reader sees is longtable's `\bigskipamount` plus ours rather than the one asked for.
     */
    var CAPTION_FAR_SKIP = 6;      // pt, on the side of the caption AWAY from the table
    function captionPreamble(f) {
      var t = f.tables || {};
      var below = t.captionPosition !== 'above';
      var skip = ptNum(t.captionSkip, 4);
      var near = skip + 'pt', far = CAPTION_FAR_SKIP + 'pt';
      /* FNT-4: a caption's own size, weight and slope.
       *
       * It is set inside \chCaptionOpen rather than in the preamble because a caption is
       * an ordinary paragraph (CAP-3) with nothing else marking it — there is no caption
       * environment left to restyle. Blank size means the document's, which is what the
       * caption was already coming out at, so a profile that says nothing here is
       * byte-identical to before.
       */
      var capSize = ptNum(t.captionFontSize, 0);
      var capFont = (capSize ? '\\fontsize{' + capSize + 'pt}{' + (Math.round(capSize * 1.2 * 100) / 100) + 'pt}\\selectfont' : '') +
        emph(t.captionBold, t.captionItalic);
      return [
        below ? '\\setlength{\\LTpost}{0pt}' : '\\setlength{\\LTpre}{0pt}',
        '\\newcommand{\\chCaptionOpen}{\\par\\addvspace{' + (below ? near : far) + '}\\begingroup' +
          capFont + (t.captionCentre ? '\\centering' : '\\raggedright') + '}',
        '\\newcommand{\\chCaptionClose}{\\par\\endgroup\\addvspace{' + (below ? far : near) + '}}'
      ];
    }

    /* TOC-1/TOC-2: the contents list, printed where the document says rather than where
     * pandoc's template would put it.
     *
     * `toc: true` in the YAML emits the list immediately after `\maketitle`, before any
     * content, with LaTeX's own "Contents" heading — which makes it the one part of the
     * document the section order could not move. `\@starttoc{toc}` prints the entries
     * and NOTHING else, so the heading above them is this file's, numbered (or not) and
     * ordered by the same machinery as every other section.
     *
     * The stretch is reset inside it because a contents list is not prose: at 1.15 the
     * gaps compound with the class's own inter-entry skip, which is what makes a
     * seven-section report take most of a page to list.
     */
    function tocPreamble(f) {
      var toc = f.toc || {};
      var gap = ptNum(toc.entrySpacing, 2);
      var depth = Number(toc.depth);
      if (!isFinite(depth) || depth < 1) depth = 3;
      return [
        '\\usepackage{tocloft}',
        '\\setlength{\\cftbeforesecskip}{' + gap + 'pt}',
        // Nested entries take half, as the class itself does.
        '\\setlength{\\cftbeforesubsecskip}{' + (Math.round(gap * 50) / 100) + 'pt}',
        '\\setlength{\\cftbeforesubsubsecskip}{' + (Math.round(gap * 50) / 100) + 'pt}',
        '\\setcounter{tocdepth}{' + Math.round(depth) + '}',
        // `@` must be a letter when the body is TOKENISED, not when it is called, so
        // \makeatletter has to sit outside \newcommand rather than inside it.
        '\\makeatletter',
        '\\newcommand{\\chContents}{\\begingroup\\setstretch{1}\\@starttoc{toc}\\endgroup}',
        '\\makeatother'
      ];
    }

    function preamble(profile, opts) {
      opts = opts || {};
      var f = normalise(profile);
      var lines = ['\\usepackage{titlesec}', '\\usepackage{fancyhdr}', '\\usepackage{setspace}',
        // A 64-character SHA-256 and a long package name are single unbreakable words
        // in a typewriter font, and LaTeX will happily run them 50mm past the right
        // margin rather than break them (verified: 146pt overfull on the provenance
        // block). seqsplit offers a breakpoint between every character, which TeX uses
        // only when it has to — so short identifiers are untouched and long ones wrap.
        '\\usepackage{seqsplit}',
        '\\let\\chOriginalTexttt\\texttt'];
      lines = lines.concat(codePreamble(f), captionPreamble(f), tocPreamble(f));

      if (f.page.lineSpacing && Number(f.page.lineSpacing) !== 1) {
        lines.push('\\setstretch{' + Number(f.page.lineSpacing) + '}');
      }
      // FNT-2: a sans package sets \sfdefault and stops there, so `fontfamily: tgheros`
      // on its own produces a document whose body is still Latin Modern Roman and whose
      // (unused) sans family is Helvetica — the setting appears to do nothing. header-includes
      // is read after the template has loaded the package, so this is where it can be said.
      if (font(f).sans) lines.push('\\renewcommand{\\familydefault}{\\sfdefault}');
      /* FNT-4: the body's own weight and slope.
       *
       * \AtBeginDocument rather than a preamble declaration, because the document's
       * default series is fixed when the body starts and a bare \bfseries in the
       * preamble is undone by it. Everything that sets its own — every heading level,
       * both table row fonts, the caption — states both halves in full (see emph), so
       * this reaches the prose and nothing that has an opinion of its own.
       */
      if (f.page.bold || f.page.italic) {
        lines.push('\\AtBeginDocument{' + emph(f.page.bold, f.page.italic) + '}');
      }
      lines = lines.concat(tablePreamble(f));
      f.levels.forEach(function (lv) { lines = lines.concat(levelPreamble(lv)); });

      return lines.concat(headerFooterPreamble(f, opts)).join('\n');
    }

    /**
     * HDR-1: the running header and footer, and the optional different first page.
     * @param {Object} f  a normalised profile
     * @param {{classification?:string}} opts
     */
    function headerFooterPreamble(f, opts) {
      var hf = f.headerFooter;
      /* The classification banner is a HEADER AND FOOTER, so it belongs here rather than
       * competing with them for the same slots. It is applied as a DEFAULT — filling the
       * centre slot only where the profile has left it empty — by resolveHeaderFooter,
       * which the PREVIEW also calls, so the two cannot disagree about where it lands.
       */
      var resolved = resolveHeaderFooter(f, opts);
      var sets = {};
      HF_SETS.forEach(function (k) {
        sets[k] = {};
        HF_SLOTS.forEach(function (s) { sets[k][s] = slotLatex(resolved[k][s]); });
      });
      // The banner is the one thing the profile did not write, so it is the one thing
      // this file styles rather than passing through as the operator typed it.
      if (opts.classification) {
        // Also the preamble, so also MD.latex — see slotLatex.
        var banner = '\\textbf{' + MD.latex(opts.classification) + '}';
        Object.keys(resolved.banner).forEach(function (k) { sets[k][resolved.banner[k]] = banner; });
      }
      function slots(set, head) {
        var cmd = head ? '\\fancyhead' : '\\fancyfoot';
        return HF_SLOTS.filter(function (s) { return sets[set][s]; })
          .map(function (s) { return cmd + '[' + HF_LETTER[s] + ']{' + sets[set][s] + '}'; });
      }
      var out = ['\\pagestyle{fancy}', '\\fancyhf{}', '\\renewcommand{\\headrulewidth}{0pt}'];
      // `lastpage` only when something asks for the total — an unused package is a
      // download and a risk on a machine building this offline.
      if (usesPages(hf)) out.unshift('\\usepackage{lastpage}');
      out = out.concat(slots('header', true), slots('footer', false));
      /* Pandoc puts the first page of each top-level section on `plain`, which would
       * otherwise lose the header and footer entirely. Redefining `plain` to be `fancy`
       * is what keeps them.
       *
       * The FIRST page is a style of its own, `chfirst`, and NOT a redefinition of
       * `plain` — which is what the first attempt did, on the assumption that page 1 is
       * a plain page. It is not: with the automatic title block off there is no
       * `\maketitle`, so page 1 is an ordinary `fancy` page and the first-page slots
       * never appeared. Measured in a built PDF, where page 1 carried the running
       * header. App.doc emits `\thispagestyle{chfirst}` as the document's first block,
       * which is the only thing that can reach page 1 specifically.
       */
      out.push('\\fancypagestyle{plain}{\\pagestyle{fancy}}');
      if (hf.firstDifferent) {
        /* No second `\renewcommand{\headrulewidth}{0pt}` here, and that is not tidiness.
         *
         * Pandoc's `latex_macros` extension READS a `\renewcommand` in the input and
         * APPLIES it to everything after it. The rule above therefore defines
         * `\headrulewidth` as the literal `0pt`, and a second copy of the same line came
         * out of pandoc as `\renewcommand{0pt}{0pt}` — renewing something that is not a
         * command at all, which errors and takes this whole page style down with it.
         * Found by building the PDF: page one was still wearing the running header.
         * The rule above is document-wide, so there is nothing to repeat.
         */
        out.push('\\fancypagestyle{chfirst}{\\fancyhf{}' +
          slots('firstHeader', true).join('') + slots('firstFooter', false).join('') + '}');
      }
      return out;
    }

    /**
     * HDR-1: the header and footer as the PREVIEW needs them — plain text, with the
     * classification banner folded into the same slots the preamble folds it into.
     *
     * The two must agree about which slot the banner lands in, and the only way to
     * guarantee that is for both to compute it the same way; so the preamble calls this
     * too, and differs from the preview only in what it does with the result.
     * `page` and `pages` are left as the words they are — the preview knows the page
     * number and substitutes them itself, since it is the only one that can.
     *
     * The banner takes the first slot that is FREE, preferring the centre: the shipped
     * profile puts the page number in the footer's centre, so insisting on the centre
     * would have left the footer with no banner at all. A set whose three slots are all
     * spoken for gets none — at that point the operator has said what they want on that
     * line, and overwriting one of their slots is not a decision this file should make.
     * `banner` records which slot each set gave up, so the caller can style it.
     * @returns {{firstDifferent:boolean, banner:Object, header:Object, footer:Object,
     *            firstHeader:Object, firstFooter:Object}}
     */
    function resolveHeaderFooter(profile, opts) {
      var hf = normalise(profile).headerFooter;
      var cls = (opts && opts.classification) ? String(opts.classification) : '';
      var out = { firstDifferent: hf.firstDifferent, banner: {} };
      HF_SETS.forEach(function (k) {
        out[k] = {};
        HF_SLOTS.forEach(function (s) { out[k][s] = String(hf[k][s] || '').trim(); });
      });
      if (cls) {
        var fill = ['header', 'footer'].concat(hf.firstDifferent ? ['firstHeader', 'firstFooter'] : []);
        fill.forEach(function (k) {
          var free = ['centre', 'left', 'right'].filter(function (s) { return !out[k][s]; })[0];
          if (free) { out[k][free] = cls; out.banner[k] = free; }
        });
      }
      return out;
    }

    /** HDR-1: does any slot ask for the page TOTAL? Decides whether lastpage is loaded. */
    function usesPages(hf) {
      return HF_SETS.some(function (k) {
        return HF_SLOTS.some(function (s) {
          return slotParts(hf[k][s]).some(function (p) { return p.token === 'pages'; });
        });
      });
    }

    /**
     * HDR-1: one slot's text as LaTeX — literals escaped once, markers as their macros.
     *
     * `MD.latex`, NOT `MD.text`: this lands in `header-includes`, which pandoc passes
     * through verbatim, so it is the one string in a generated document that LaTeX reads
     * without pandoc in between. Escaped for markdown it produced `\<` from a header
     * reading "<---- Security classification", which is not a command LaTeX has.
     *
     * GEN-TAB: a placeholder in a slot has already been filled in by the time this runs
     * (App.generate fills them on the RAW slot text before the profile is compiled), so
     * the value is escaped by this one call along with the words around it. The
     * document-wide pass escapes for markdown, which is right for the body and would be
     * exactly as wrong here as the `\<` above.
     */
    function slotLatex(text) {
      return slotParts(text).map(function (p) {
        return p.token ? HF_MACROS[p.token] : MD.latex(p.text);
      }).join('');
    }

    /**
     * FMT-3: the complete YAML metadata block that opens the generated file.
     * @param {Object} profile
     * @param {{title:string, subtitle?:string, date?:string, author?:string,
     *          classification?:string, extra?:Array<{key:string,value:*}>}} meta
     * @returns {string}
     */
    function frontMatter(profile, meta) {
      meta = meta || {};
      var f = normalise(profile);
      var geometry = [
        'top=' + len(f.page.marginTop, '25mm'),
        'bottom=' + len(f.page.marginBottom, '25mm'),
        'left=' + len(f.page.marginLeft, '25mm'),
        'right=' + len(f.page.marginRight, '25mm')
      ];
      var entries = [
        { key: 'title', value: meta.title || '' },
        { key: 'subtitle', value: meta.subtitle || '' },
        { key: 'author', value: meta.author || '' },
        { key: 'date', value: meta.date || '' },
        { key: 'papersize', value: f.page.paper },
        { key: 'fontsize', value: pt(f.page.fontSize, '11pt') },
        // FNT-2: a package name, which pandoc's template turns into \usepackage{…}
        // before header-includes is read. Blank is dropped by MD.yaml, which leaves
        // pandoc's own default font in place rather than naming it.
        { key: 'fontfamily', value: font(f).value },
        { key: 'geometry', value: geometry },
        // App.doc writes the numbers, so LaTeX must not (see levelPreamble).
        { key: 'numbersections', value: false },
        // TOC-1: `toc: true` prints the list straight after \maketitle, which is the
        // one position the section order cannot move it to or away from. A document
        // that carries a contents SECTION prints it there instead, and says so here by
        // asking for no automatic one. The other two documents have no such section and
        // keep the automatic list, so nothing they do changes.
        { key: 'toc', value: meta.tocSection ? false : !!(f.toc && f.toc.include) },
        { key: 'toc-depth', value: (!meta.tocSection && f.toc && f.toc.include) ? Number(f.toc.depth || 3) : null },
        { key: 'colorlinks', value: true },
        { key: 'linkcolor', value: 'black' },
        { key: 'header-includes', value: { block: preamble(f, { classification: meta.classification }) } }
      ].concat(meta.extra || []);
      return MD.yaml(entries.filter(function (e) { return e.value !== null; }));
    }

    /**
     * FMT-4: structural check for an imported profile. Additive and forgiving —
     * anything missing is filled from the baseline — so this reports only the errors
     * that would make a profile meaningless rather than merely incomplete.
     * @returns {{ok:boolean, issues:Issue[], profile:?Object}}
     */
    function validate(raw, loc) {
      var issues = [];
      function bad(msg) { issues.push({ category: 'validation', severity: 'error', message: msg, location: loc || 'format' }); }
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { bad('A formatting profile must be an object.'); return { ok: false, issues: issues, profile: null }; }
      if (!raw.id || typeof raw.id !== 'string') bad('A formatting profile needs a string id.');
      if (!raw.name || typeof raw.name !== 'string') bad('A formatting profile needs a name.');
      if (raw.levels !== undefined && !Array.isArray(raw.levels)) bad('levels must be an array.');
      if (issues.length) return { ok: false, issues: issues, profile: null };
      var p = normalise(raw);
      delete p.builtin;                       // an imported profile is never the built-in
      return { ok: true, issues: [], profile: p };
    }

    /* -------------------------------------------------------------------------
     * PRV-2: the profile, expressed as CSS, so a preview can look like the page.
     *
     * Everything a profile decides reaches the PDF through the YAML block and the LaTeX
     * preamble — which the markdown preview, quite reasonably, ignores. The result was
     * a preview that answered "what does the document SAY" and not "what does it LOOK
     * like": changing the paper, the margins, the heading sizes or the table shading
     * changed nothing on screen until the PDF was built.
     *
     * This compiles the same profile a second time, into CSS, for a page-shaped box.
     * It is an approximation and is meant to be — a browser is not TeX — but it is an
     * approximation of the RIGHT numbers, derived from the one profile rather than from
     * a set of hard-coded preview styles that could drift from it.
     *
     * Everything interpolated is sanitised on the way out: sizes through Number(),
     * colours through normaliseShade. A stylesheet built from user text is an injection
     * route otherwise, and the values here come from text boxes.
     * ---------------------------------------------------------------------- */

    // Paper widths in millimetres, and 96dpi for the conversion to CSS pixels.
    var PAPER_MM = { a4: 210, letter: 215.9, a5: 148, legal: 215.9 };
    var PX_PER_MM = 96 / 25.4;

    /** A length in millimetres; a bare number is read as mm, as `geometry` does. */
    function mm(v, dflt) {
      var m = /^\s*([\d.]+)\s*(mm|cm|in|pt)?\s*$/.exec(String(v == null ? '' : v));
      if (!m) return dflt;
      var n = Number(m[1]);
      if (!isFinite(n)) return dflt;
      var unit = m[2] || 'mm';
      return unit === 'cm' ? n * 10 : unit === 'in' ? n * 25.4 : unit === 'pt' ? n * 25.4 / 72 : n;
    }
    /** A point size as a number; `11pt` and `11` both give 11. */
    function ptNum(v, dflt) {
      var m = /^\s*([\d.]+)\s*(pt)?\s*$/.exec(String(v == null ? '' : v));
      var n = m ? Number(m[1]) : NaN;
      return isFinite(n) && n > 0 ? n : dflt;
    }
    /** The width of the text block, in millimetres — paper less both margins. */
    function textWidthMm(profile) {
      var f = normalise(profile);
      var paper = PAPER_MM[f.page.paper] || PAPER_MM.a4;
      return Math.max(40, paper - mm(f.page.marginLeft, 25) - mm(f.page.marginRight, 25));
    }

    /* PRV-4: the numbers a PAGED preview needs, which a continuous one never did.
     *
     * A preview that shows where the pages fall has to know how tall a page is, not just
     * how wide the text is — and it has to know the four margins, because a header sits
     * inside the top one and a footer inside the bottom one. All of it comes off the same
     * profile the PDF is built from, so the sheet on screen is the sheet on the desk at
     * whatever scale the pane can give it.
     */
    var PAPER_HEIGHT_MM = { a4: 297, letter: 279.4, a5: 210, legal: 355.6 };
    /**
     * @returns {{width:number, height:number, top:number, bottom:number, left:number,
     *            right:number}} all in CSS pixels at 96dpi
     */
    function pageMetrics(profile) {
      var f = normalise(profile);
      var px = function (v) { return Math.round(v * PX_PER_MM); };
      return {
        width: px(PAPER_MM[f.page.paper] || PAPER_MM.a4),
        height: px(PAPER_HEIGHT_MM[f.page.paper] || PAPER_HEIGHT_MM.a4),
        top: px(mm(f.page.marginTop, 25)), bottom: px(mm(f.page.marginBottom, 25)),
        left: px(mm(f.page.marginLeft, 25)), right: px(mm(f.page.marginRight, 25))
      };
    }
    /** SPC-1: a millimetre length in CSS pixels at 96dpi — the scale the paper is drawn at. */
    function mmPx(v) {
      var n = Number(v);
      return isFinite(n) && n > 0 ? Math.round(n * PX_PER_MM) : 0;
    }
    /** The same, in CSS pixels, clamped to something a pane can actually show. */
    function textWidthPx(profile) {
      return Math.max(280, Math.min(900, Math.round(textWidthMm(profile) * PX_PER_MM)));
    }

    /**
     * FNT-1: what App.md's width model needs to know about this profile — the page in
     * ems, and each table font size relative to the document's.
     *
     * Without it the model measures every table at the document size, and a header set
     * a point larger overflows by exactly the ratio it was enlarged by. Passed rather
     * than read, because App.md has no business knowing which profile is in force.
     * @returns {{pageEm:number, head:number, body:number, firstCol:number}}
     */
    function tableMetrics(profile) {
      var f = normalise(profile);
      var base = ptNum(f.page.fontSize, 11);
      var body = ptNum(f.tables.fontSize, base);
      return {
        pageEm: textWidthMm(f) / 25.4 * 72 / base,
        head: ptNum(f.tables.headFontSize, base) / base,
        body: body / base,
        // FNT-6: blank means the table body's size, which is what the empty macro does.
        firstCol: ptNum(f.tables.firstColFontSize, body) / base
      };
    }

    /**
     * PRV-2: the profile as a stylesheet, scoped to `.rd-paper`.
     * @param {Object} profile @returns {string} CSS
     */
    function previewCss(profile) {
      var f = normalise(profile);
      var base = ptNum(f.page.fontSize, 11);
      var spacing = Number(f.page.lineSpacing);
      if (!isFinite(spacing) || spacing <= 0) spacing = 1.15;
      // 1pt of a document at 96dpi, scaled so an 11pt page reads at a comfortable size
      // on screen rather than at its literal physical size.
      var px = function (pt) { return Math.round(pt * 96 / 72 * 100) / 100; };
      var out = [
        // FNT-2: the family is stated on the paper and inherited by everything on it —
        // headings, tables, captions — exactly as \familydefault is on the page. It is
        // safe to interpolate because normalise() has already reduced it to one of the
        // fixed FONTS rows; nothing a text box can produce reaches this string.
        '.rd-paper { width: ' + textWidthPx(f) + 'px; max-width: 100%; margin: 0 auto;' +
          ' background: #fff; color: #111; font-family: ' + font(f).css + ';' +
          ' font-size: ' + px(base) + 'px; line-height: ' + (Math.round(spacing * 100) / 100) + '; }',
        // FNT-4: the body's own weight and slope, on the paper — the counterpart of the
        // \AtBeginDocument in the preamble. Stated on the paragraph rather than on the
        // sheet so a heading, a table and a caption keep their own.
        '.rd-paper p, .rd-paper li { font-size: ' + px(base) + 'px; line-height: ' + (Math.round(spacing * 100) / 100) + ';' +
          ' font-weight: ' + (f.page.bold ? '700' : '400') + '; font-style: ' + (f.page.italic ? 'italic' : 'normal') + '; }',
        // FNT-1/FNT-4: four sizes now, and blank means "the document size" for the three
        // table ones — which is what LaTeX does with them, so the preview agrees by
        // construction. Weight and slope travel with each size, for the same reason.
        '.rd-paper .prv-table { font-size: ' + px(ptNum(f.tables.fontSize, base)) + 'px;' +
          ' font-weight: ' + (f.tables.bold ? '700' : '400') + '; font-style: ' + (f.tables.italic ? 'italic' : 'normal') + '; }',
        '.rd-paper .prv-table th { font-size: ' + px(ptNum(f.tables.headFontSize, base)) + 'px;' +
          ' font-weight: ' + (f.tables.headBold ? '700' : '400') + '; font-style: ' + (f.tables.headItalic ? 'italic' : 'normal') + '; }',
        // The page's own defaults, and they must be stated rather than inherited: the
        // app's table styling paints a header with `--c-surface-alt`, which in dark mode
        // is a near-black cell on a white sheet — and shows an UNSTYLED header as though
        // it were a shaded one. Emitted before the shade rules below, which override it.
        '.rd-paper .prv-table th, .rd-paper .prv-table td { border-color: #bbb; background: transparent; color: #111; }',
        /* `font-size: inherit` is the whole point of this rule.
         *
         * The app's own preview styling pins a code span to 12px, which is fine for a
         * themed panel and wrong for a page: it left every package name at one size
         * while the prose around it followed the profile, so setting a table size
         * appeared to skip the identifiers. On the page a code span is `\texttt`, which
         * changes the FAMILY and keeps the size — so the preview does the same, and a
         * code span takes the size of whatever it is sitting in: the table body, the
         * header row, or the document. */
        // CODE-1: the shade is the profile's, and blank means none — so a preview of a
        // profile with no code shading shows unshaded code, as the page will.
        '.rd-paper code { background: ' + (f.page.codeShade || 'transparent') + '; color: #111; font-size: inherit;' +
          ' padding: ' + (f.page.codeShade ? '0.1em 0.2em' : '0') + '; }',
        // The caption is emitted before the table's first rule, so the row-font machinery
        // has not started when it is set — it came out at the DOCUMENT size (measured:
        // 10.91pt in an 11pt document beside a 9pt table). FNT-4 gives it a size of its
        // own, and blank still means the document's, so that measurement still holds.
        '.rd-paper .prv-caption { color: #333; font-size: ' + px(ptNum(f.tables.captionFontSize, base)) + 'px;' +
          ' font-weight: ' + (f.tables.captionBold ? '700' : '400') + '; font-style: ' + (f.tables.captionItalic ? 'italic' : 'normal') + '; }'
      ];
      f.levels.forEach(function (lv) {
        var size = ptNum(lv.size, 12);
        var lead = ptNum(lv.leading, size + 3);
        var before = ptNum(lv.spaceBefore, 0);
        var after = ptNum(lv.spaceAfter, 0);
        // TTL-3: a title is an h1 element carrying its own class, because on the page it
        // is an H1 command carrying its own \titleformat. Same shape, both places.
        out.push('.rd-paper ' + (lv.level === TITLE_STYLE_LEVEL ? '.prv-title' : '.prv-h' + lv.level) + ' {' +
          ' font-size: ' + px(size) + 'px;' +
          ' line-height: ' + px(lead) + 'px;' +
          ' font-weight: ' + (lv.bold ? '700' : '400') + ';' +
          ' font-style: ' + (lv.italic ? 'italic' : 'normal') + ';' +
          ' margin: ' + px(before) + 'px 0 ' + px(after) + 'px; }');
      });
      // TBS-1: the profile's ACTUAL colours here, not a themed stand-in. The paper is a
      // page, so it is white whatever the app's theme is, and the colours read true.
      var t = f.tables;
      // FNT-4: opting a header row in buys the SHADE and nothing else now — its weight
      // and slope come from the Fonts table above and reach every table alike.
      if (t.head && t.head.shade) out.push('.rd-paper .prv-shade-head thead th { background: ' + t.head.shade + '; }');
      // FNT-5: opting the first column in buys the SHADE, on the same rule as the header
      // row. Its weight and slope are document-wide and travel as markdown emphasis, so
      // they are already in the HTML as <strong>/<em> — a CSS rule here would be a second
      // opinion about the same thing, and the one that disagreed with the page.
      if (t.firstColumn && t.firstColumn.shade) out.push('.rd-paper .prv-shade-col tbody td:first-child { background: ' + t.firstColumn.shade + '; }');
      /* FNT-6: its SIZE is not an opt-in — it reaches every table, as the header row's
       * does, so it is stated against every table's first column rather than against the
       * shaded ones. Emitted only when the profile sets one, so a document that leaves it
       * blank has exactly the stylesheet it had before. */
      if (ptNum(t.firstColFontSize, 0)) {
        out.push('.rd-paper .prv-table tbody td:first-child { font-size: ' + px(ptNum(t.firstColFontSize, base)) + 'px; }');
      }
      // CAP-2: the caption's own alignment, whatever the table does.
      out.push('.rd-paper .prv-caption { text-align: ' + (t.captionCentre ? 'center' : 'left') + '; }');
      return out.join('\n');
    }

    /**
     * TBS-1: the `style` App.md.table wants, for a table that has asked for one.
     *
     * The profile owns the LOOK; the table owns whether it wears it. Keeping the two
     * apart is what lets a house style be changed once and reach every table that opted
     * in — and what stops a table carrying a colour that a report template moved on
     * from. Absent flags mean an unstyled table, which is the default everywhere.
     *
     * @param {Object} profile @param {?{head?:boolean, firstColumn?:boolean}} flags
     * @returns {?{head?:Object, firstColumn?:Object}} null when nothing is styled
     */
    function tableStyle(profile, flags) {
      flags = flags || {};
      var t = normalise(profile).tables;
      var out = {};
      // FNT-4: the header row's WEIGHT is a document-wide setting now (tables.headBold),
      // applied to every table through \chTblHeadFont. What opting in still buys is the
      // shading, which is genuinely per-table — so this hands over the shade alone, and
      // App.md emits no markdown emphasis for a header row at all.
      if (flags.head) out.head = { shade: t.head.shade };
      /* FNT-5: the first column, on the same footing.
       *
       * Its weight and slope reach EVERY table, whether or not the section opted in —
       * they are a kind of text the document sets, like the header row's. A LaTeX macro
       * cannot carry them the way \chTblHeadFont carries the header's (nothing pandoc
       * writes marks a column), so they travel as markdown emphasis on the first cell of
       * each body row, which is where App.md was already putting them.
       *
       * Opting in adds the SHADE, and only the shade. So a profile that sets neither
       * hands over nothing and the table is left alone — which is what `null` means to
       * App.md.table, and why an unstyled document still emits exactly what it did.
       */
      var col = {};
      if (t.firstColBold) col.bold = true;
      if (t.firstColItalic) col.italic = true;
      // FNT-6: the size does reach every table through a macro, so unlike the weight it
      // is handed over as a flag — App.md emits the span, the preamble holds the number.
      if (ptNum(t.firstColFontSize, 0)) col.fontSize = ptNum(t.firstColFontSize, 0);
      if (flags.firstColumn && t.firstColumn.shade) col.shade = t.firstColumn.shade;
      if (Object.keys(col).length) out.firstColumn = col;
      return Object.keys(out).length ? out : null;
    }

    App.docFormat = {
      STANDARD: STANDARD, standard: standard, normalise: normalise,
      list: list, resolve: resolve, validate: validate,
      preamble: preamble, frontMatter: frontMatter, tablePreamble: tablePreamble,
      tableStyle: tableStyle, normaliseShade: normaliseShade,
      // PRV-2: the same profile, compiled for the on-screen preview instead of for TeX.
      previewCss: previewCss, textWidthMm: textWidthMm, textWidthPx: textWidthPx, mmPx: mmPx, tableMetrics: tableMetrics,
      // PRV-4: the sheet, for a preview that shows where the pages fall.
      pageMetrics: pageMetrics,
      // SEC-4: which heading levels already start a page of their own.
      levelBreaks: levelBreaks,
      PAPERS: PAPERS, NUMBER_POSITIONS: NUMBER_POSITIONS, LATEX_LEVELS: LATEX_LEVELS,
      // HDR-1: the header and footer, as four sets of three slots.
      HF_SETS: HF_SETS, HF_SLOTS: HF_SLOTS, HF_MACROS: HF_MACROS, slotParts: slotParts,
      headerFooter: resolveHeaderFooter,
      FONTS: FONTS, font: font
    };
  })(App);
  /* =============================================================================
   * MODULE: App.doc  — DOC-1..DOC-4: the document outline, numbering and renderer
   * PURPOSE: Turn an ordered list of report BLOCKS into a numbered, cross-referenced
   *          markdown document. Owns four things the generators must not each
   *          re-invent: heading-level resolution (DOC-1), hierarchical auto-numbering
   *          (DOC-2), stable cross-references (DOC-3), and the rendering of a
   *          hand-authored custom section's parts (DOC-4).
   * PURITY:  pure. No DOM, no I/O, no clock — the same blocks always render the
   *          same bytes, which is what DOD-7 requires of every generated artifact.
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
    /* CTR-1: the ordinal in the centring macro names App.docFormat defines per level.
     * Named by ordinal rather than by LaTeX command so this module does not have to
     * know which command a level maps to — the same reason it emits \chTitleStyle by
     * name. The two lists must agree, and a self-test is what says they do. */
    var CENTRE_WORDS = ['One', 'Two', 'Three', 'Four'];
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
     * A level SKIP (an H3 with no H2 above it) has no single right answer. LaTeX
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
     * Build the reference resolver handed to App.md.rich().
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
    function refIndex(resolved, tables) {
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
      return { byId: byId, order: order };
    }

    /**
     * Build the reference resolver handed to App.md.rich().
     * @param {Array} resolved  the output of outline()
     * @param {Array<{id:string,number:string,caption:string,anchor:string}>} [tables]
     */
    function refResolver(resolved, tables) {
      var idx = refIndex(resolved, tables);
      return function (id) { return idx.byId[id] || null; };
    }

    /** The pickable link targets, for the designer's "insert reference" menu. */
    function refTargets(resolved, tables) {
      var idx = refIndex(resolved, tables);
      return idx.order.map(function (e) {
        var r = idx.byId[e.id];
        return { id: e.id, kind: e.kind, label: r.label, numberLabel: r.numberLabel, titleLabel: r.titleLabel };
      });
    }

    /* CAP-1: every table in the document is captioned, and the numbers agree.
     *
     * LaTeX numbers a captioned table itself — `\caption{X}` prints "Table 3: X". So
     * the caption text must NOT carry a number of its own (it used to, and the PDF read
     * "Table 3: Table 3 — X"), and the counter this module keeps is only there so a
     * cross-reference can NAME the number the page will show. The two agree because
     * every table now has a caption and both count them in emitted order — which is
     * also why an uncaptioned table is not allowed: one would advance LaTeX's counter
     * without advancing ours, and every reference after it would be off by one.
     */
    var TBL_ANCHOR = /^\[\]\{#(tbl-[A-Za-z0-9-]+)\}\s*$/;
    var TBL_CAPTION = /^:\s+(\S.*)$/;
    var ESCAPED = /\\([\\`*_{}\[\]<>#|$&^~%+\-=.!()])/g;

    /**
     * The captioned tables inside a GENERATED body, in emitted order. Generated bodies
     * are opaque markdown by the time they reach here, so they are read back rather
     * than declared — App.md emits the anchor line and the caption line as a pair, and
     * nothing between them is anything but the table itself.
     */
    function scanTables(md) {
      var out = [], pending = null;
      String(md == null ? '' : md).split('\n').forEach(function (l) {
        var a = TBL_ANCHOR.exec(l);
        if (a) { pending = { anchor: a[1], caption: '' }; out.push(pending); return; }
        if (!pending) return;
        var c = TBL_CAPTION.exec(l);
        if (c) { pending.caption = c[1].trim().replace(ESCAPED, '$1'); pending = null; }
      });
      return out;
    }

    /**
     * Assign document-wide table numbers, in emitted order. Done as its own pass
     * because a table's number depends on how many tables precede it across the WHOLE
     * document, which no single section can know — and because a reference to a table
     * has to resolve before that table's own section is rendered.
     *
     * A hand-authored table is read from its PART (its caption is still editable at
     * this point); a generated one is read back out of the body its producer already
     * built. Both land in the one list, so a reference can point at either.
     *
     * @returns {Array<{id,number,caption,anchor}>}
     */
    function tableIndex(resolved) {
      var out = [], n = 0;
      function push(id, caption, anchor) {
        n++;
        out.push({ id: id, number: String(n), caption: String(caption || '').trim(), anchor: anchor });
      }
      /* A grouped dataset declares its groups as `children`, and outline() FLATTENS
       * them into the list as blocks of their own. Descending into `children` as well
       * as reading those blocks counted every group's table twice: a report with a
       * three-group Packages section numbered its tables 1,2,3,4,5,3,4,5,… and every
       * cross-reference after it named a number the page did not print. So a parent
       * whose children are already in the list is not descended into. Un-outlined
       * blocks (the designer's per-section preview, and any caller holding the raw
       * shape) have no flattened children, and are walked as before. */
      var flattened = {};
      (resolved || []).forEach(function (b) { if (b && b.parentId) flattened[b.parentId] = true; });
      (resolved || []).forEach(function (b) {
        if (b.kind === 'custom') {
          (b.parts || []).forEach(function (p) {
            if (p.kind !== 'table') return;
            // CAP-4: a table asked to go uncaptioned takes no number either. It cannot
            // then be cross-referenced — "see Table 4" needs a Table 4 — which is the
            // trade the option is, and it is what keeps every OTHER number honest:
            // renderPart reads its caption from this list, so a table that is not here
            // emits none, and the count and the page agree by construction.
            if (p.noCaption === true) return;
            push(p.id, autoCaption(b, p), MD.anchor('tbl-' + p.id));
          });
          return;
        }
        // The body comes first, then each child, which is the order render() emits them.
        scanTables(b.body).forEach(function (t) { push(t.anchor, t.caption, t.anchor); });
        if (!flattened[b.id]) {
          (b.children || []).forEach(function (c) {
            scanTables(c.body).forEach(function (t) { push(t.anchor, t.caption, t.anchor); });
          });
        }
      });
      return out;
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

    /* -------------------------------------------------------------------------
     * DOC-4: rendering a hand-authored section.
     *
     * A custom section is an ordered list of PARTS, because "a heading, then some
     * paragraphs, then a table, then another paragraph" is the actual shape of the
     * writing people do — a fixed header/body/table skeleton would force the author
     * to fight it. Four part kinds cover it: paragraph, table, rule, page break.
     * ---------------------------------------------------------------------- */

    /** One part -> markdown. @param {Object} part @param {Object} ctx {resolveRef, tables} */
    function renderPart(part, ctx) {
      if (!part) return '';
      if (part.kind === 'rule') return MD.rule();
      if (part.kind === 'pagebreak') return MD.pageBreak();
      // SPC-1: a measured gap. A part rather than a property of the part above it,
      // because it is placed and moved like anything else in the section — the space
      // under a paragraph and the space above the signature block are the same object.
      if (part.kind === 'space') return MD.vspace(part.height);
      if (part.kind === 'para') {
        var body = MD.rich(part.text, { resolveRef: ctx.resolveRef, linkTerms: ctx.linkTerms });
        if (!body) return '';
        // A part inside an already-centred section is not centred a second time: two
        // nested `center` environments contribute their vertical space twice, which on a
        // title page — the thing people centre — is a visible gap nobody asked for.
        if (part.centre && !ctx.centred) body = MD.centred(body);
        // REF-1: an empty span before the paragraph, so a reference can land on this
        // paragraph rather than on the section it happens to sit in. Pandoc turns it
        // into `\hypertarget{…}{}`, which is exactly what a heading's own id becomes.
        // A part with no id is not addressable and gets no anchor — every part the
        // designer creates has one, but App.doc is also called with hand-built shapes.
        return part.id ? '[]{#' + MD.anchor('par-' + part.id) + '}\n\n' + body : body;
      }
      if (part.kind === 'table') {
        /* RTX-2: a cell holds the same rich text a paragraph does.
         *
         * It used to be handed straight to MD.cell, which escapes and marks long
         * identifiers and does nothing else — so a cell was the one place in a
         * hand-authored section where bold, a code span, a line break or a
         * cross-reference could not be written. Same tokens, same writer, same
         * resolver; only the line-separator differs, and richCell owns that.
         */
        var cellOpts = { resolveRef: ctx.resolveRef, linkTerms: ctx.linkTerms };
        var head = (part.header || []).map(function (h) { return MD.richCell(h, cellOpts); });
        var rows = (part.rows || []).map(function (r) {
          // Ragged rows are padded, never dropped: a half-filled table is a table the
          // author is still writing, and losing the row they just added is worse than
          // an empty cell.
          var out = [];
          for (var i = 0; i < head.length; i++) out.push(MD.richCell(r && r[i] != null ? r[i] : '', cellOpts));
          return out;
        });
        if (!head.length) return '';
        var meta = (ctx.tables || []).filter(function (t) { return t.id === part.id; })[0];
        var tbl = MD.table(head, rows, {
          align: part.align || [],
          // TW-1: widths are per-column fractions the author dragged; absent means the
          // old behaviour (each column as wide as its content).
          widths: (part.widths && part.widths.length === head.length) ? part.widths : null,
          // SPC-1: extra millimetres under the body rows that were ticked — a table used
          // as a form. No ticks recorded means every row, which is what it meant before
          // there were ticks.
          rowHeight: part.rowHeight,
          tallRows: (part.tallRows && part.tallRows.length === (part.rows || []).length) ? part.tallRows : null,
          // TBS-1: the table says whether it is styled; the profile says how.
          style: ctx.styleFor ? ctx.styleFor(part) : null,
          metrics: ctx.metrics || null,
          caption: meta ? { id: part.id, text: meta.caption } : null
        });
        return (part.centre && !ctx.centred) ? MD.centred(tbl) : tbl;
      }
      return '';
    }

    /** A whole custom section's body (its parts, in order) -> markdown. */
    function renderParts(parts, ctx) {
      return MD.join((parts || []).map(function (p) { return renderPart(p, ctx); }));
    }

    /**
     * Emit one block's heading line. Level 5 emits nothing — that is what "normal
     * text" means — and the block's body simply continues under whatever heading
     * preceded it.
     */
    /**
     * @param {Object} b  the block
     * @param {string} [gap]  SPC-1: the space-above macro call, which has to sit BETWEEN
     *        the styling declarations and the heading itself — the title's `\chTitleStyle`
     *        sets `\sectionbreak`, and a gap emitted ahead of it would have its one-shot
     *        overwritten before titlesec ever called it.
     */
    function headingFor(b, gap) {
      gap = gap ? gap + '\n\n' : '';
      if (b.level === BODY_LEVEL) return '';
      var title = String(b.title == null ? b.label : b.title).trim();
      if (!title) return '';
      // TTL-1: a title prints at the top level and carries no number. It is the same
      // `#` an H1 emits — what separates them is the numbering, and (TTL-3) the styling
      // the two macros below switch between.
      var lvl = b.level === TITLE_LEVEL ? 1 : b.level;
      /* TOC-1: a contents list does not list itself. Its heading is a heading like any
       * other and would otherwise land in the .toc file with the rest — pandoc's
       * `.unnumbered .unlisted` pair emits `\section*` with no `\addcontentsline`,
       * which is the one thing that keeps it out (verified against pandoc 3.1.11).
       *
       * SEC-4: any section can now ask for the same treatment. A title block, a
       * colophon or a signature page prints a heading and has no business in the
       * contents list, and until now the only way to keep one out was to give it no
       * heading at all — which also took away its anchor, and with it every
       * cross-reference to it.
       *
       * D-063: it has to be the PAIR, and `.unlisted` on its own did nothing at all.
       *
       * Pandoc's `unlisted` is only read alongside `unnumbered` — measured on 3.1.11, not
       * inferred: `# X {.unlisted}` comes out as a plain `\section{X}`, and `\section`
       * puts itself in the .toc whatever the class said. So the switch worked in the
       * preview (which builds its own contents list from the outline) and did nothing in
       * the PDF, which is the only place it matters.
       *
       * The pair was avoided because "unnumbered" sounds like it takes the number away.
       * It does not, here: `numbersections` is false for the whole document — App.doc
       * writes every number into the heading TEXT, because LaTeX cannot produce the
       * numbering this document uses — so `.unnumbered` changes exactly one thing,
       * `\section` to `\section*`, and that is what stops the `\addcontentsline`. The
       * heading still reads "3 Approval", titlesec still styles it, `\sectionbreak` still
       * fires for it (all three measured on a built page), and the `\label` is still
       * emitted, so every cross-reference to it still lands. */
      var classes = (b.kind === 'toc' || b.noToc) ? ['unnumbered', 'unlisted'] : null;
      var head = MD.heading(lvl, (b.number ? b.number + ' ' : '') + MD.text(title), b.anchor, classes);
      /* TTL-3: a title's own styling, switched on for this heading and off again after.
       *
       * Both levels emit `\section`, so the profile's title row cannot reach the page as
       * a second `\titleformat` in the preamble — the later one would simply win for
       * both. It reaches it as a pair of declarations around the one heading instead.
       * See App.docFormat.styleMacro for why this is not a `\begingroup`.
       *
       * CTR-1: centring is another face of the same declaration, so it is chosen here
       * rather than wrapped around the heading. A `center` environment around a heading
       * left it justified (titlesec sets the text in a box `\centering` does not reach)
       * and put a blank page in front of it (the environment's glue fires before
       * `\sectionbreak`) — both measured, both gone with the environment.
       */
      if (b.level === TITLE_LEVEL) {
        return MD.rawLatex(b.centre ? '\\chTitleStyleCentred' : '\\chTitleStyle') +
          '\n\n' + gap + head + '\n\n' + MD.rawLatex('\\chSectionStyle');
      }
      if (b.centre) {
        var word = CENTRE_WORDS[lvl - 1];
        if (word) return MD.rawLatex('\\chCentre' + word) + '\n\n' + gap + head + '\n\n' + MD.rawLatex('\\chPlain' + word);
      }
      return gap + head;
    }

    /* SPC-1: the macro call that puts a section further down its page.
     *
     * Named by level rather than written as a `\vspace`, because whether the gap has to
     * clear the page first is the PROFILE's answer (App.docFormat.gapMacro) — the same
     * division of labour as \chCentreOne above. A section with no heading has no break
     * hook to work through and takes the plain skip.
     */
    var GAP_NAMES = ['One', 'Two', 'Three', 'Four'];
    function gapFor(b) {
      if (!(Number(b.spaceBefore) > 0)) return '';
      var title = String(b.title == null ? b.label : b.title).trim();
      if (b.level === BODY_LEVEL || !title) return MD.vspace(b.spaceBefore);
      var name = b.level === TITLE_LEVEL ? 'Title' : GAP_NAMES[b.level - 1];
      if (!name) return MD.vspace(b.spaceBefore);
      var len = MD.mmLen(b.spaceBefore);
      return len ? MD.rawLatex('\\chGap' + name + '{' + len + '}') : '';
    }

    /* CAP-3: the caption a reader sees, written by this module rather than by LaTeX.
     *
     * App.md emits a table as an anchor line, the table, and a `: caption` marker —
     * pandoc's own caption syntax, which put the text inside the longtable's first head
     * and therefore always ABOVE the table, and which numbered it with LaTeX's counter
     * rather than the one every cross-reference in this document is written against.
     *
     * Rewriting the marker here settles both at once: the number is the number
     * tableIndex already assigned (so "see Table 4" and the caption on that table are
     * the same string by construction, not by two counters agreeing), and the caption
     * is an ordinary paragraph, which can therefore sit on either side of the table.
     * The two macros around it carry the look, and live in the formatting profile.
     *
     * The number is prefixed as plain text and needs no escaping: it is digits, dots
     * and a colon, and the line begins with the word "Table", so nothing in it can be
     * read as a list marker or any other markdown construct.
     */
    function captionBlock(number, text) {
      return MD.rawLatex('\\chCaptionOpen') + '\n\n' +
        'Table ' + number + ': ' + text + '\n\n' +
        MD.rawLatex('\\chCaptionClose');
    }

    /**
     * Replace every `: caption` marker in one body with its numbered caption.
     * @param {string} md
     * @param {function():string} nextNumber  consumed in emitted order, as tableIndex assigned them
     * @param {boolean} above  put the caption before the table rather than after it
     */
    function captionise(md, nextNumber, above) {
      if (!md || md.indexOf('[]{#tbl-') === -1) return md;
      var lines = String(md).split('\n'), out = [], anchorAt = -1, open = false;
      for (var i = 0; i < lines.length; i++) {
        if (TBL_ANCHOR.test(lines[i])) { open = true; anchorAt = out.length; out.push(lines[i]); continue; }
        var c = open ? TBL_CAPTION.exec(lines[i]) : null;
        if (!c) { out.push(lines[i]); continue; }
        var block = captionBlock(nextNumber(), c[1].trim());
        // Above, the caption goes OUTSIDE the group the table may be wrapped in (the
        // anchor is the first line of that unit); below, it stays where the marker was.
        if (above) out.splice(anchorAt, 0, block, '');
        else out.push(block);
        open = false;
      }
      return out.join('\n');
    }

    /**
     * DOC-2: assemble the finished document.
     *
     * @param {{title:string, frontMatter?:Array, blocks:Array}} spec
     *        Each block is an outline() result plus a `body` string of ready markdown
     *        (already escaped by its producer) and/or `parts` for a custom section.
     * @returns {string} the complete .md file
     */
    function render(spec) {
      spec = spec || {};
      var resolved = spec.blocks || [];
      var tables = tableIndex(resolved);
      var ctx = { resolveRef: refResolver(resolved, tables), tables: tables, styleFor: spec.styleFor || null,
        metrics: spec.metrics || null, linkTerms: spec.linkTerms || null };
      // CAP-3: the numbers, in emitted order — the same order tableIndex assigned them
      // and the same order render walks, so the two cannot drift apart.
      var queue = tables.map(function (t) { return t.number; }), qi = 0;
      var nextNumber = function () { return queue[qi++] || String(qi); };
      var above = spec.captionPosition === 'above';
      var out = [];
      /* HDR-1: a raw block that has to be the FIRST thing in the body.
       *
       * `\thispagestyle` applies to the page it is issued on, so a different first page
       * can only be asked for from inside the document — the preamble has no way to
       * name page 1. Kept as a spec field rather than built here, because which style
       * (if any) page 1 wears is a formatting decision and App.doc has no profile.
       */
      if (spec.prologue) out.push(MD.rawLatex(spec.prologue));
      resolved.forEach(function (b) {
        // SPC-1: the gap belongs to the heading, not to the vertical list before it —
        // see gapFor. A section with no heading gets it as a plain skip instead.
        var gap = gapFor(b);
        var h = headingFor(b, gap);
        if (!h && gap) out.push(gap);
        var centred = b.centre && b.kind === 'custom';
        var body = b.kind === 'custom'
          ? renderParts(b.parts, centred ? Object.assign({}, ctx, { centred: true }) : ctx)
          : (b.body || '');
        /* CTR-1: a HAND-AUTHORED section's centring, which never reached the document.
         *
         * A generated section is centred by App.docGen.sectionContent, which is where
         * its body is built. A custom section's body is built HERE, from its parts, and
         * nothing centred it — so the switch worked in the per-section preview (which
         * centres it itself) and did nothing in the .md. Exactly the sections people
         * centre, too: a title page is always hand-authored.
         */
        if (centred && body) body = MD.centred(body);
        /* TBL-1: a grouped register's tables, under the section rather than under
         * sub-headings of their own. They used to be flattened into the block list by
         * outline() and emitted as blocks; now they are simply the rest of this
         * section's body, in declaration order — which is the order tableIndex counts
         * them in, so the captions and the cross-references still agree. */
        (b.children || []).forEach(function (c) { if (c && c.body) body = MD.join([body, c.body]); });
        body = captionise(body, nextNumber, above);
        // SEC-1/SEC-2: the introduction sits between the heading and whatever the
        // register produced, and carries its number when it has one. The number is
        // escaped because `4.1` in column 1 is an ordered-list marker in markdown.
        //
        // REF-1: rendered HERE rather than by the generator, which is the whole of the
        // fix for "links only work in custom sections". The generator fills a section's
        // body before the outline exists, so it had no reference resolver to hand and
        // called `MD.rich(intro, {})` — every {{ref:…}} in an introduction resolved to
        // nothing. By the time render() walks the blocks the outline and the table index
        // are both built, so an introduction gets exactly the ctx a custom paragraph does.
        var intro = b.introBody != null ? String(b.introBody)
          : (String(b.intro || '').trim() ? MD.rich(b.intro, ctx) : '');
        if (intro && b.introNumber) intro = MD.text(b.introNumber) + ' ' + intro;
        /* SEC-4: the section's own page break, and only when its LEVEL is not already
         * making one.
         *
         * The formatting profile's per-level `pageBreakBefore` reaches the page as
         * `\sectionbreak` — LaTeX's own hook, invisible to this module. Emitting a
         * `\newpage` here as well gave two breaks and therefore a blank page between
         * them, which is exactly the fault D-038 was about. `levelBreaks` says which
         * levels already break, so the two can never both fire.
         */
        var levelBreaks = spec.levelBreaks || {};
        if (b.pageBreakBefore && !levelBreaks[b.level]) out.push(MD.pageBreak());
        if (h) out.push(h);
        if (intro) out.push(intro);
        if (body) out.push(body);
      });
      var doc = MD.join(out);
      return spec.frontMatter ? spec.frontMatter + '\n\n' + doc + '\n' : doc + '\n';
    }

    App.doc = {
      LEVELS: LEVELS, BODY_LEVEL: BODY_LEVEL, TITLE_LEVEL: TITLE_LEVEL, levelLabel: levelLabel,
      outline: outline, refResolver: refResolver, refTargets: refTargets,
      tableIndex: tableIndex, scanTables: scanTables, autoCaption: autoCaption,
      renderPart: renderPart, renderParts: renderParts,
      headingFor: headingFor, gapFor: gapFor, render: render
    };
  })(App);
  /* =============================================================================
   * MODULE: App.report
   * PURPOSE: Platform-agnostic MARKDOWN section builders (spec §10.3, DOD-8). Turns
   *          an adapter's DECLARED report columns into a markdown table, and the
   *          subject's metadata into the block that opens every document. Produces
   *          BODIES only — headings, numbering and anchors belong to App.doc, which
   *          is the one place that knows where a block sits in the outline.
   * PURITY:  pure (data -> string)
   * DEPENDS: App.md
   * INVARIANTS: ALL dynamic text passes through App.md.text/cell/code. The key column
   *             of every table is emitted as a CODE SPAN, because a key is an
   *             identifier — verbatim in markdown, \texttt{} in LaTeX, and immune to
   *             the underscores and dollars that fill a captured register.
   * ============================================================================= */
  (function (App) {
    'use strict';
    var MD = App.md;

    /* -------------------------------------------------------------------------
     * v2.2: this module used to emit a Word-targeted HTML document — an inline
     * stylesheet tuned to what Word's HTML importer honours, page-break divs, fixed
     * colgroup widths. All three document outputs are markdown now, converted to PDF
     * through pandoc and LaTeX, so none of that survives: LaTeX does its own layout,
     * and a fixed column width expressed in a colgroup means nothing to it.
     *
     * What is left is the part that was always the real content — the mapping from an
     * adapter's declared columns to a table — plus the escaping discipline, which
     * matters more now than it did in HTML. An unescaped `&` in HTML was a cosmetic
     * bug; in LaTeX it is a compile error.
     * ---------------------------------------------------------------------- */

    /* CAP-1/TBS-1: every generated table takes a caption and, when the section asked
     * for one, a header/first-column style. Both arrive as one `opts` object rather
     * than as new positional arguments, so an adapter that never heard of either keeps
     * working unchanged (DOD-11). The caption id is DERIVED from the block, never
     * minted, which is what keeps the .md byte-stable across runs (DOD-7). */
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
      if (!col || !col.optional) return true;
      var v = (colOpts || {})[col.id];
      return v === undefined ? col.defaultOff !== true : v !== false;
    }

    function tableOpts(opts, extra) {
      opts = opts || {};
      var out = Object.assign({}, extra || {});
      if (opts.style) out.style = opts.style;
      if (opts.widths && opts.widths.length) out.widths = opts.widths;
      if (opts.metrics) out.metrics = opts.metrics;
      // REF-2: control ids never reach a table by accident, so an absent list is absent
      // rather than empty — App.md decides the table's FORM partly on this.
      if (opts.rowAnchors && opts.rowAnchors.length) out.rowAnchors = opts.rowAnchors;
      // TBL-1: the operator's own title row, already escaped by the caller.
      if (opts.titleRow) out.titleRow = opts.titleRow;
      if (opts.captionId) out.caption = { id: opts.captionId, text: opts.captionText || '' };
      return out;
    }

    /** The subject's metadata block (host.subject.meta), as a markdown table.
     *  TBL-1: `opts.headings` reworks the two column headings; absent, they are the
     *  wording this block has always used. */
    function metaTable(meta, opts) {
      var headings = ((opts || {}).headings || ['Field', 'Value']);
      return MD.table(
        headings.map(MD.cell),
        (meta || []).map(function (m) {
          // Hashes, ids and firmware strings are identifiers; the label is prose.
          return [MD.cell(m.label), m.code === false ? MD.cell(m.value) : MD.code(m.value)];
        }),
        tableOpts(opts)
      );
    }

    /**
     * A titled table as a standalone block body.
     * @param {Array<string|{label:string}>} headerCells
     * @param {Array<Array<string>>} rows  RAW strings — escaped here, once
     * @param {{align?:string[], empty?:string, style?:Object,
     *          captionId?:string, captionText?:string}} [opts]
     */
    function renderTable(headerCells, rows, opts) {
      opts = opts || {};
      var cells = (headerCells || []).map(function (h) { return typeof h === 'string' ? h : h.label; });
      var body = (rows || []).map(function (r) { return r.map(MD.cell); });
      if (!body.length) {
        // GEN-5: one canonical empty row, so "nothing to report" is stated rather
        // than left as a bare header the reader has to interpret.
        var first = [MD.cell(opts.empty || 'None.')];
        for (var i = 1; i < cells.length; i++) first.push('');
        body = [first];
      }
      return MD.table(cells.map(MD.cell), body, tableOpts(opts, { align: opts.align || [] }));
    }

    /**
     * Build one dataset report section from the adapter's DECLARED columns (spec
     * §20.3) — column- and group-aware, and with no knowledge of any particular
     * dataset (DOD-11).
     *
     * A grouped dataset returns CHILDREN rather than one body: one table per group,
     * each with its own caption and anchor so it can be cross-referenced.
     *
     * TBL-1: a child is no longer a SUB-SECTION. It used to carry the group's declared
     * name — "Removed", "Disabled", "Kept" — as a numbered heading above its table and
     * again as a "— Removed" suffix on the caption, which put the same word on the page
     * three times and put a heading between a section's introduction and the tables it
     * introduces. The tables now sit directly under the section, and what distinguishes
     * them is the TITLE ROW, which the operator writes (see App.md's title fences).
     *
     * @returns {{body:string, children:Array<{id:string,label:string,body:string}>}}
     */
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

    function buildSection(sectionLabel, keyCol, columns, items, opts, ctx, groups) {
      opts = opts || {};
      var colOpts = opts.columns || {};
      var visible = (columns || []).filter(function (c) { return columnOn(c, colOpts); });
      // TBL-1: the key column is addressable like any other, so its heading can be
      // reworded too. `_key` is the id App.docGen.sectionColumns already gives it.
      var cols = [Object.assign({ id: '_key' }, keyCol)].concat(visible);

      function rowsFor(list) {
        return list.slice().sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; })
          .map(function (it) {
            return cols.map(function (c, i) {
              var v = c.get(it, ctx);
              v = (v == null) ? '' : String(v);
              // Column 0 is the register key: an identifier, so a code span.
              // REF-2: everything else is prose, and a control named in it — in the
              // Control column, or in passing in a Rationale — links to its coverage row.
              return i === 0 ? MD.code(v) : MD.autoLink(MD.cell(v), opts.linkTerms);
            });
          });
      }
      /**
       * @param {string} key  the group value, or `_all` for a single-table section
       * @param {string} dfltCaption  what the caption reads as when nobody has said
       */
      function tableFor(list, key, capId, dfltCaption) {
        var text = tableText(opts, key);
        var headers = cols.map(function (c) { return headerFor(c, text.columns); });
        var rows = rowsFor(list);
        if (!rows.length) {
          var empty = [MD.cell('None.')];
          for (var i = 1; i < headers.length; i++) empty.push('');
          rows = [empty];
        }
        /* TBL-1: a caption follows the title row when there is one.
         *
         * With the group sub-headings gone, three tables in one section would otherwise
         * all be captioned with the section's heading — "Table 4: Packages, Table 5:
         * Packages" — which is exactly the thing that makes a cross-reference useless.
         * The title row is already the operator's name for THIS table, so it is the
         * right default, and an explicit caption still overrides it.
         */
        var title = String(text.title || '').trim();
        return MD.table(headers.map(MD.cell), rows, tableOpts({
          style: opts.style, widths: opts.widths, metrics: opts.metrics,
          titleRow: title ? MD.text(title) : '',
          // CAP-4: a table the operator asked to leave uncaptioned emits no caption line
          // and no anchor, which is also what keeps it out of the numbering — App.doc
          // reads the numbers back off the caption markers this writes.
          captionId: text.noCaption === true ? '' : capId,
          captionText: String(text.caption || '').trim() || title || dfltCaption
        }));
      }

      var capBase = opts.captionId || '';
      var capName = opts.captionText || sectionLabel;
      if (groups && groups.field) {
        var groupOpts = opts.groups || {};
        return {
          body: '',
          children: groups.options.filter(function (g) { return groupOpts[g.value] !== false; }).map(function (g) {
            return {
              id: g.value,
              label: g.label,
              // TBL-1: the caption is the SECTION's name, not "Packages — Removed". The
              // group's declared label has stopped appearing on the page at all; what
              // names one of a section's tables is the title row the operator writes.
              body: tableFor(items.filter(function (it) { return it.decision && it.decision[groups.field] === g.value; }),
                g.value, capBase ? capBase + '-' + g.value : '', capName)
            };
          })
        };
      }
      return { body: tableFor(items, ONE_TABLE, capBase, capName), children: [] };
    }

    App.report = { renderTable: renderTable, buildSection: buildSection, metaTable: metaTable, tableOpts: tableOpts,
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
      // build() is what the workspace previews and what its Generate button emits;
      // linkTerms() is how a host says which words in a table become links. Both
      // optional: without build() the preview says so, without linkTerms() nothing
      // links, and neither stops a document being produced.
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
   *          columns — into rendered markdown, so a host that only wants a table
   *          does not have to write the code that draws one. A provider may still
   *          supply render() for anything a table cannot express.
   * PURITY:  pure. No DOM, no I/O, no clock.
   * DEPENDS: App.report
   * INVARIANTS: renderSection is the ONLY path from a provider to markdown, so a
   *             declared section and a hand-rendered one cannot come to disagree
   *             about captioning, styling or column widths.
   * ============================================================================= */
  (function (App) {
    'use strict';

    /**
     * @param {Object} provider  a section provider: {label, keyColumn, columns,
     *                           groups?, render?}
     * @param {Array}  rows      the rows this section is to show
     * @param {Object} ctx       render context, passed to every column getter
     * @param {Object} opts      caption / style / width options from the block
     * @returns {{body: string, children: Array}}
     */
    function renderSection(provider, rows, ctx, opts) {
      if (!provider) return { body: '', children: [] };

      // The escape hatch, and the reason it stays: control coverage groups by control
      // and sub-groups by dataset, which buildSection's single grouping axis cannot
      // express. Declaring columns covers the ordinary case, not every case.
      if (typeof provider.render === 'function') {
        return normalise(provider.render(rows || [], ctx || {}, opts || {}));
      }

      var key = provider.keyColumn ||
        { id: '_key', label: 'Key', get: function (r) { return r.key; } };
      return normalise(App.report.buildSection(
        provider.label, key, provider.columns || [],
        rows || [], opts || {}, ctx || {}, provider.groups || null
      ));
    }

    /* buildSection already returns {body, children} — '' plus children when grouped,
     * a table plus [] when not. A hand-written render() is somebody else's code, so
     * it is held to the same shape here rather than everywhere downstream. */
    function normalise(out) {
      if (out == null) return { body: '', children: [] };
      if (typeof out === 'string') return { body: out, children: [] };
      return { body: out.body || '', children: out.children || [] };
    }

    App.docProviders = { renderSection: renderSection };
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

    /** The title-row and caption half of the same, folded into a table's options. */
    function withWording(tblOpts, text, dfltCaption) {
      var title = String(text.title || '').trim();
      var out = Object.assign({}, tblOpts, {
        titleRow: title ? MD.text(title) : '',
        captionText: String(text.caption || '').trim() || title || dfltCaption
      });
      // CAP-4: no caption means no caption LINE, which is what leaves the table out of
      // the numbering — App.doc counts the markers rather than the tables.
      if (text.noCaption === true) out.captionId = '';
      return out;
    }

    App.docBlocks = {
      applySectionOrder: applySectionOrder,
      tableWording: tableWording,
      headingsFor: headingsFor,
      withWording: withWording
    };
  }(App));

  /* =============================================================================
   * MODULE: App.docGen — DOC-GEN: the document, built from a host's declarations
   * PURPOSE: Turn what a HOST declares — its sections, its subject, its filter —
   *          into the blocks a document is made of, the columns each block prints
   *          and the markdown each block contains. This is the generator half of
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
               categories: (opts && opts.categories) || (opts && opts.relevance) || null };
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
    function hostBlocks(host, opts) {
      opts = opts || {};
      var state = (host && typeof host.getState === 'function' && host.getState()) || {};
      var sec = opts.sections || {}, d = [];
      var bag = state.report || {};
      var levels = bag.levels || {};

      /* TOC-1: the contents list is a section, so it can be ordered, levelled, renamed
       * and given an introduction like any other. It used to be a YAML variable, which
       * pinned it immediately after the title with LaTeX's own heading — the one part of
       * the document the section order could not touch.
       *
       * TWO switches, and both mean something: "Include a table of contents" in the
       * formatting profile is the house decision and travels with the profile; the
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

      var names = bag.names || {}, intros = bag.intros || {}, tstyles = bag.tableStyles || {}, twidths = bag.tableWidths || {};
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
          label: name || String(heading).trim() || b.label,
          name: name,
          // TOC-1: a contents list starts as a TITLE — "1 Contents" numbered ahead of
          // the section it lists reads as a section of the report, which it is not. It
          // is only a default; the level picker moves it like any other block's.
          level: levels[b.id] === undefined ? (b.kind === 'toc' ? App.doc.TITLE_LEVEL : null) : levels[b.id],
          centre: centred[b.id] === true,
          // SEC-1: prose the operator wrote to sit between this section's heading and
          // its generated table. Stored as the same rich-text token markup a custom
          // paragraph uses, so one editor serves both.
          intro: String(intros[b.id] || ''),
          // SEC-2: whether that introduction takes a number of its own.
          introNumbered: introNums[b.id] === true,
          // TBS-1: which of this section's tables wear the profile's table styling.
          tableStyle: { head: (tstyles[b.id] || {}).head === true, firstColumn: (tstyles[b.id] || {}).firstColumn === true },
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
    function hostColumns(host, block, opts) {
      opts = opts || {};
      if (!block || block.kind === 'custom') return null;
      var colOpts = (opts.columns || {})[columnKey(block)] || {};
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
        return pack([{ id: key.id || '_key', label: key.label }].concat(declared.filter(function (c) { return !c.optional; })),
                    declared.filter(function (c) { return c.optional; }));
      }
      if (block.kind === 'meta') return pack([{ id: 'field', label: 'Field' }, { id: 'value', label: 'Value' }], []);
      return null;
    }
    /**
     * Fill in ONE generated block's content.
     *
     * Pulled out of buildReport so the Report Design workspace can render a single
     * section for its preview without generating the whole document — and, more to the
     * point, so the preview of a section and the section in the finished document come
     * from the same call and cannot drift.
     *
     * @returns {Object} the block, plus `body` (markdown) and/or `children`
     */
    function hostContent(host, b, opts, ctx, metaRows) {
      opts = opts || {};
      var out;
      // CAP-1/TBS-1: a generated table's caption is DERIVED from the block it belongs
      // to, so the same project always emits the same caption and the same anchor
      // (DOD-7) — nothing is minted at generate time.
      var capText = String(b.title || '').trim() || b.label;
      var profile = App.docFormat.resolve((host && typeof host.getState === 'function' && host.getState()) || {});
      var tblOpts = {
        captionId: b.id, captionText: capText,
        // REF-2: a control named in any cell of this section links to its coverage row.
        linkTerms: opts.linkTerms || null,
        metrics: App.docFormat.tableMetrics(profile),
        style: App.docFormat.tableStyle(profile, b.tableStyle),
        // TW-2: a generated table's columns are the section's, not any one table's, so a
        // grouped register's groups all wear the same widths — which is right, since
        // they are the same columns showing different rows.
        widths: (b.widths && b.widths.length) ? b.widths : null
      };
      if (b.kind === 'toc') {
        // TOC-1: the whole body is one macro. The entries come from LaTeX's .toc file,
        // which is written by the headings this document has already emitted — so a
        // contents section placed at the end lists the same document as one at the
        // front, and neither needs to be told what is in it.
        out = Object.assign({}, b, { body: App.md.rawLatex('\\chContents') });
      } else if (b.kind === 'meta') {
        var metaText = App.docBlocks.tableWording(b, '_all');
        out = Object.assign({}, b, { body: metaRows
          ? App.report.metaTable(metaRows,
              Object.assign(App.docBlocks.withWording(tblOpts, metaText, capText),
                { headings: App.docBlocks.headingsFor(['field', 'value'], ['Field', 'Value'], metaText.columns) }))
          : '' });
      } else if (providerOf(opts, b.id, null, host)) {
        /* 8: every generated section arrives here. Registers, control coverage and
         * guideline deviations used to be three branches, two of which meant this code
         * knew what a control and a dataset were. They are host providers now, reached
         * the same way any section a future host declares will be. */
        var pv = providerOf(opts, b.id, null, host);
        var ck = columnKey(b, pv);
        var pr = App.docProviders.renderSection(pv, pv.rows ? pv.rows() : [], ctx,
          Object.assign({
            columns: (opts.columns || {})[ck],
            colOpts: (opts.columns || {})[ck],
            groups: groupTicks(pv, opts, ck),
            // TBL-1: the per-table wording, passed straight through to buildSection —
            // a provider never has to know it exists (DOD-11).
            tables: b.tables || null,
            block: b
          }, tblOpts));
        out = Object.assign({}, b, { body: pr.body, children: pr.children });
      } else if (b.kind === 'custom') {
        out = b;                                            // App.doc renders its parts
      } else {
        out = b;
      }
      /* SEC-1: the operator's own words, between the heading and whatever the register
       * produced. It sits ABOVE the table because that is where a reader looks for what
       * a table is for — and it belongs to the section rather than to the table, so a
       * grouped dataset's introduction is written once rather than once per group.
       *
       * Kept OUT of `body` and handed to App.doc as its own field, because SEC-2 lets it
       * take a number and numbering is App.doc's job — baked into the body it would have
       * been a string nobody could put a number in front of. */
      // SEC-1: the introduction stays as its TOKEN text and is rendered by App.doc,
      // which is the only place holding a reference resolver (REF-1). It used to be
      // rendered here with an empty options object, which is why a cross-reference in
      // an introduction printed as "[missing reference]" — or, before REF-1, as the
      // raw token.
      // Centring is applied to the BODY, not the heading: a centred heading is a
      // formatting-profile decision, and centring the heading here would fight it.
      if (b.centre) {
        if (out.body) out = Object.assign({}, out, { body: App.md.centred(out.body) });
        if (out.children && out.children.length) {
          out = Object.assign({}, out, { children: out.children.map(function (c) {
            return Object.assign({}, c, { body: c.body ? App.md.centred(c.body) : c.body });
          }) });
        }
      }
      return out;
    }

    /* =========================================================================
     * GEN-TAB: `/[Tag]` — a placeholder filled in at generate time.
     *
     * Write `/[Date]` in a heading, an introduction, a table cell, a footer — anywhere
     * you type text — and the Generate pane lists it once with a box beside it. What you
     * put in the box replaces every occurrence in the document.
     *
     * Found and replaced on the FINISHED markdown, not on the strings that went into it,
     * and that is the whole design. A tag can appear in any of a dozen places — a
     * section heading, a section name, an introduction, a table's title row, a column
     * heading, a paragraph, a hand-authored cell, a header slot — and threading a
     * substitution through all of them is a dozen chances to miss one. The document is
     * the one place they have all arrived at, so it is the one place this happens.
     *
     * Both escaped and unescaped forms are matched, because both occur: prose reaches
     * the .md through MD.text and comes out as `/\[Date\]`, while the same tag inside a
     * code span is verbatim. The body is deliberately narrow — letters, digits, spaces,
     * `_` and `-`, up to 40 characters — so that a `/[` inside a captured device value
     * cannot be mistaken for one.
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
     *
     * The replacement is escaped, because it is text somebody typed arriving in a
     * document that is markdown on its way to LaTeX. It is escaped ONCE, here, on the
     * same rule as everything else. This is the BODY's escaper: the one place a
     * placeholder can land that is NOT markdown is a header or footer slot, and those
     * are filled in before the profile is compiled (see taggedProfile), so by the time
     * this runs there is nothing left in the preamble for it to get wrong.
     */
    /**
     * GEN-TAB: the name the operator gave the file, made safe to be one.
     *
     * A filename typed into a box reaches `download`'s `a[download]` attribute, so it is
     * reduced to characters that cannot mean anything to a filesystem or a shell — no
     * separators, no traversal, no leading dot. Blank (or nothing left after that) falls
     * back to the device-and-timestamp name every other artifact uses.
     */
    function docFilename(name) {
      var s = String(name == null ? '' : name).trim().replace(/\.md$/i, '');
      s = s.replace(/[^A-Za-z0-9 ._-]+/g, '-').replace(/^[.\-]+/, '').replace(/\s+/g, ' ').trim();
      return s ? s + '.md' : '';
    }

    function applyTags(md, values, raw) {
      values = values || {};
      return String(md == null ? '' : md).replace(TAG_RE, function (whole, e1, name) {
        var v = values[name];
        if (v === undefined || v === null || !String(v).length) return whole;
        // `raw` for a header or footer slot, which is escaped later and for LaTeX.
        return raw ? String(v) : App.md.text(String(v));
      });
    }
    /* =========================================================================
     * CONF-1: blocks in, one finished document out.
     *
     * This is the last step of generation and the one a host should not have to
     * write: resolve the formatting profile, number the headings, assemble the YAML
     * front matter, render the blocks, then fill in the `/[Tag]` placeholders in one
     * pass over the finished markdown.
     *
     * It lived in CH, which meant a second host could build every block the module
     * offers and still have no way to turn them into a .md without copying eighty
     * lines of pipeline. What is genuinely CH's about it — a device id, a project
     * hash, the words "OFFICIAL: Sensitive", the stable name each command's file
     * takes — arrives on `meta`, computed by whoever knows those things.
     * ====================================================================== */

    /**
     * GEN-TAB: a profile whose header and footer slots have had their placeholders
     * filled in, on the RAW text.
     *
     * Every other placeholder in the document is substituted at the very end, on the
     * finished markdown, which is what makes one pass catch them all. A slot cannot wait
     * for that pass: it reaches the page through `header-includes`, which pandoc hands
     * to LaTeX verbatim, so what goes in has to be escaped for LaTeX rather than for
     * markdown — and by the end of the pipeline the slot has already been escaped and
     * the two cannot be told apart. Filled here, the value is escaped by `slotLatex`
     * along with the words around it, once, in the right language.
     */
    function taggedProfile(profile, tags) {
      if (!tags || !Object.keys(tags).length) return profile;
      var out = JSON.parse(JSON.stringify(profile));
      var hf = out.headerFooter || {};
      App.docFormat.HF_SETS.forEach(function (k) {
        App.docFormat.HF_SLOTS.forEach(function (slot) {
          if (hf[k] && hf[k][slot]) hf[k][slot] = applyTags(hf[k][slot], tags, true);
        });
      });
      return out;
    }

    /**
     * Assemble, render and package a document.
     *
     * @param {Object} host    the installed host; only getState() is read
     * @param {Array} blocks   sectionContent()-shaped, each with `body` and/or `parts`
     * @param {{title?:string, subtitle?:string, date?:string, classification?:string,
     *          extra?:Array<{key:string,value:string}>, linkTerms?:Object,
     *          tags?:Object, filename?:string, fallbackName?:string,
     *          logicalName?:string}} meta
     * @returns {{blob:Blob,name:string,issues:Issue[],text:string,tags:string[],files:Object[]}}
     */
    function emitDocument(host, blocks, meta) {
      meta = meta || {};
      var state = (host && typeof host.getState === 'function' && host.getState()) || {};
      var profile = taggedProfile(App.docFormat.resolve(state), meta.tags);
      var resolved = App.doc.outline(blocks, {
        baseLevel: 1,
        clampSkips: profile.headings.clampSkips !== false,
        numbered: profile.headings.numbered !== false
      });
      /* TTL-2: the automatic title block is a CHOICE, and it is off unless asked for.
       *
       * `title`/`subtitle`/`date` in the YAML make pandoc's template call \maketitle,
       * which prints a title page this file composed — a heading, a model-and-firmware
       * line and a date — ahead of everything the designer arranged. Anyone who wants
       * their own title page cannot have one while it is there, and there is no
       * markdown that suppresses it: the only way not to get the block is not to name
       * the metadata. So the switch simply withholds the three keys.
       *
       * What is NOT withheld is the provenance the host handed in as `extra`: it still
       * travels as its own YAML keys below, and the metadata section still prints it
       * where a reader can see it. */
      var titleBlock = ((state.report || {}).titleBlock === true);
      var frontMatter = App.docFormat.frontMatter(profile, {
        title: titleBlock ? (meta.title || '') : '',
        subtitle: titleBlock ? (meta.subtitle || '') : '',
        date: titleBlock ? (meta.date || '') : '',
        // TOC-1: this document prints its own contents list iff it carries the section.
        tocSection: (blocks || []).some(function (b) { return b && b.kind === 'toc'; }),
        // The BANNER TEXT, not a flag: what a document is marked as is the host's own
        // vocabulary, and a module that spelled one classification out could only ever
        // serve the organisation that uses it.
        classification: meta.classification || '',
        // The manifest's job, done inside the document. `extra` lands in the YAML
        // block, which pandoc carries into the PDF metadata and any reader can see.
        extra: meta.extra || []
      });
      // TBS-1: the PART carries the flags, the PROFILE carries the look. App.doc has no
      // business knowing about either, so it is handed the resolver rather than the two.
      // HDR-1: page 1 is an ordinary page unless the profile gives it its own header
      // and footer, in which case it has to be told so from inside the document.
      var firstPage = profile.headerFooter && profile.headerFooter.firstDifferent;
      var md = App.doc.render({
        frontMatter: frontMatter, blocks: resolved,
        prologue: firstPage ? '\\thispagestyle{chfirst}' : '',
        // SEC-4: so a section whose level already starts a page does not get a second
        // break, and a blank page between the two.
        levelBreaks: App.docFormat.levelBreaks(profile),
        // REF-2: prose renders its linked terms too, not just table cells. The host
        // decided which words those are, from the blocks actually being emitted.
        linkTerms: meta.linkTerms || null,
        metrics: App.docFormat.tableMetrics(profile),
        // CAP-3: which side of the table the caption goes. The look of it is the
        // profile's business too, but that reaches the page as preamble macros.
        captionPosition: profile.tables.captionPosition,
        styleFor: function (part) {
          return App.docFormat.tableStyle(profile, { head: part.styleHead === true, firstColumn: part.styleFirstColumn === true });
        }
      });
      // GEN-TAB: the last thing that happens to the document, so a tag written anywhere
      // in it — heading, table cell, footer slot, YAML title — is caught by one pass.
      md = applyTags(md, meta.tags);
      return {
        blob: new Blob([md], { type: 'text/markdown;charset=utf-8' }),
        // The DOWNLOAD name is the operator's if they typed one (GEN-TAB), and
        // otherwise whatever the host would have called it.
        name: docFilename(meta.filename) || meta.fallbackName || 'document.md',
        issues: [], text: md,
        // GEN-TAB: what is still unfilled, so the pane can say so before it is downloaded.
        tags: findTags(md),
        // `files` keeps a stable LOGICAL name, so anything inspecting what was produced
        // addresses it by what it is rather than by when it was made.
        files: [{ name: meta.logicalName || 'document.md', content: md }]
      };
    }

    /* ======================================================================
     * HTML-1: the same document as one standalone, printable HTML page.
     *
     * Made from the markdown emitDocument produced, through the live preview's own
     * renderer (App.ui.mdPreview), so the page shows what the Preview pane shows: the
     * same numbering, captions, tables and profile styling. It is for reading without
     * the pandoc/tectonic stack, not a second typesetter. What only LaTeX can do, the
     * running header and footer and any raw LaTeX, is left out. The exception is the
     * classification banner (`meta.classification`), which is printed above and below
     * the document because a reader must see it.
     *
     * Page size and margins come from the profile as `@page` rules, so printing the
     * page from a browser gives the profile's paper.
     * ====================================================================== */

    /** The page's own styles: the preview's paper rules, with the app's theme colours
     *  replaced by literal ones, because a document is white paper whatever the theme. */
    var HTML_PAGE_CSS = [
      'body { margin: 0; background: #e9ebee; }',
      '.doc-banner { text-align: center; font-weight: 700; padding: 6px 0; }',
      '.rd-paper { box-sizing: border-box; box-shadow: 0 1px 6px rgba(0,0,0,.18); padding: 20px 22px 28px; margin: 24px auto; }',
      '.rd-paper .prv-h { margin: 14px 0 6px; line-height: 1.2; }',
      '.rd-paper .prv-h1, .rd-paper .prv-title { border-bottom: 1px solid #d4d8de; padding-bottom: 3px; }',
      '.rd-paper p { margin: 6px 0; }',
      '.rd-paper .prv-tablewrap { overflow-x: auto; margin: 8px 0; }',
      '.rd-paper .prv-table { border-collapse: collapse; }',
      '.rd-paper .prv-table[style*="fixed"] { width: 100%; }',
      '.rd-paper .prv-table th, .rd-paper .prv-table td { border: 1px solid #bbb; padding: 3px 6px; text-align: left;' +
        ' vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }',
      '.rd-paper .prv-tbltitle th { text-align: center; }',
      '.rd-paper .prv-caption { margin-top: 3px; }',
      '.rd-paper .prv-toc-e { padding: 1px 0; }',
      '.rd-paper .prv-toc-n { display: inline-block; min-width: 2.4em; }',
      '.rd-paper .prv-toc-2 { padding-left: 1.6em; }',
      '.rd-paper .prv-toc-3 { padding-left: 3.2em; }',
      '.rd-paper .prv-toc-4 { padding-left: 4.8em; }',
      '.rd-paper .prv-toc-empty { color: #5b6472; }',
      '.rd-paper .prv-cp { margin: 0 0 4px; }',
      '.rd-paper .prv-cp:last-child { margin-bottom: 0; }',
      '.rd-paper .prv-rule { border: 0; border-top: 1px solid #bbb; margin: 12px 0; }',
      '.rd-paper .prv-centre { text-align: center; }',
      '.rd-paper .prv-centre .prv-tablewrap { display: inline-block; text-align: left; }',
      '.rd-paper .prv-space, .rd-paper .prv-strut { display: block; }',
      '.rd-paper a { color: #14418c; }',
      '.doc-pagebreak { border-top: 1px dashed #bbb; margin: 16px 0; }',
      '@media print {',
      '  body { background: #fff; }',
      '  .rd-paper { box-shadow: none; padding: 0; margin: 0; width: auto; max-width: none; }',
      '  .rd-paper .prv-tablewrap { overflow: visible; }',
      '  .rd-paper tr { break-inside: avoid; }',
      '  .doc-pagebreak { border: 0; margin: 0; break-after: page; }',
      '  .prv-breakbefore { break-before: page; }',
      // Not the first thing on the page: a break there would leave the banner alone on page 1.
      '  .rd-paper > .prv-breakbefore:first-child { break-before: auto; }',
      '}'
    ].join('\n');

    /** CSS page sizes for the profile's paper names; anything else prints as A4. */
    var CSS_PAPER = { a4: 'A4', a5: 'A5', letter: 'letter', legal: 'legal' };

    /**
     * @param {Object} host   the installed host; only getState() is read
     * @param {{text:string, name?:string}|string} doc  emitDocument's result, or its markdown
     * @param {{title?:string, classification?:string, lang?:string}} [meta]
     * @returns {{blob:Blob, name:string, text:string, files:Object[]}}
     */
    function emitHtml(host, doc, meta) {
      var esc = App.util.html.esc;
      meta = meta || {};
      var md = typeof doc === 'string' ? doc : String((doc && doc.text) || '');
      var state = (host && typeof host.getState === 'function' && host.getState()) || {};
      var profile = App.docFormat.resolve(state);
      var rendered = App.ui.mdPreview.toHtml(md, null, { breaks: App.docFormat.levelBreaks(profile) });
      // The preview marks a `\newpage` as a labelled rule and any other raw LaTeX as a
      // "Raw LaTeX" marker. On the page the first is a page break and the second is
      // nothing a reader needs to see.
      var body = rendered.html
        .replace(/<div class="prv-pagebreak"><span>Page break<\/span><\/div>/g, '<div class="doc-pagebreak"></div>')
        .replace(/<div class="prv-pagebreak"><span>Raw LaTeX<\/span><\/div>/g, '');
      var m = App.docFormat.pageMetrics(profile);
      var paper = CSS_PAPER[String((profile.page || {}).paper || '').toLowerCase()] || 'A4';
      var pageCss = '@page { size: ' + paper + '; margin: ' + m.top + 'px ' + m.right + 'px ' + m.bottom + 'px ' + m.left + 'px; }';
      var banner = meta.classification ? '<div class="doc-banner">' + esc(meta.classification) + '</div>' : '';
      var title = meta.title || (rendered.outline && rendered.outline[0] && rendered.outline[0].title) || 'Document';
      var html = [
        '<!doctype html>',
        '<html lang="' + esc(meta.lang || 'en') + '">',
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '<title>' + esc(title) + '</title>',
        '<style>',
        pageCss,
        HTML_PAGE_CSS,
        App.docFormat.previewCss(profile),
        '</style>',
        '</head>',
        '<body>',
        banner,
        '<main class="rd-paper">',
        body,
        '</main>',
        banner,
        '</body>',
        '</html>',
        ''
      ].join('\n');
      var mdName = (doc && typeof doc === 'object' && doc.name) || 'document.md';
      var name = /\.md$/i.test(mdName) ? mdName.replace(/\.md$/i, '.html') : mdName + '.html';
      return {
        blob: new Blob([html], { type: 'text/html;charset=utf-8' }),
        name: name, text: html,
        files: [{ name: name, content: html }]
      };
    }

    App.docGen = {
      // The three the host's own generator is a shim over.
      reportBlocks: hostBlocks, sectionColumns: hostColumns, sectionContent: hostContent,
      // How many rows sit in each of the host's filter categories.
      filterCounts: filterCounts,
      // GEN-TAB: `/[Tag]` placeholders — finding them, filling them, naming the file.
      findTags: findTags, applyTags: applyTags, docFilename: docFilename, TAG_RE: TAG_RE,
      // CONF-1: blocks in, one finished .md out — the step a host used to write itself.
      emitDocument: emitDocument,
      // HTML-1: that .md as one standalone, printable HTML page.
      emitHtml: emitHtml,
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
     * TTL-2: whether the document opens with the automatic title block — the report
     * title, the model-and-firmware line and the date, printed by pandoc's \maketitle
     * ahead of everything the designer arranged.
     *
     * A DESIGN decision, not a session one: someone who composes their own title page
     * would otherwise have to switch this off again every time the app is opened. Off
     * is stored as absence, so a project that never wanted one carries no trace of it.
     */
    function setTitleBlock(on) { return setReportSwitch('titleBlock', on); }

    /**
     * CLS-1 / CLS-2: the classification marking the report carries on every page: one of the
     * host's `classifications`, or none ('').
     *
     * It used to live in the session block with the filename and the `/[Tag]` values, on
     * the reasoning that it was an answer for one run. It is not: the sensitivity of what
     * a report contains is a property of the report, and a house that classifies one
     * classifies all of them — so re-ticking it every time the tool was opened was work
     * with no decision in it, and a document issued from an unticked session went out
     * unmarked. Stored beside the title block, and on the same presence rule.
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

    /** The shape both of the above share: a document-level switch, stored as presence. */
    function setReportSwitch(key, on) {
      if (!P()) return errNoProject();
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        if (on) b[key] = true; else delete b[key];
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
     * Same rich-text token markup a custom paragraph uses (App.md.rich), so the one
     * editor and the one escaping discipline serve both.
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
     * is also left out of the NUMBERING (see App.doc.tableIndex), so the numbers a
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
     * TBS-1: whether a GENERATED section's tables wear the profile's header-row /
     * first-column styling. The look itself is the formatting profile's; this only
     * records that this section opted in, which is why it is a boolean and not a colour.
     * @param {string} blockId @param {'head'|'firstColumn'} which @param {boolean} on
     */
    function setBlockTableStyle(blockId, which, on) {
      if (!P()) return errNoProject();
      if (!blockId) return err('A section is required.');
      if (which !== 'head' && which !== 'firstColumn') return err('Table styling is either "head" or "firstColumn".');
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.tableStyles = b.tableStyles || {};
        var e = b.tableStyles[blockId] = b.tableStyles[blockId] || {};
        if (on) e[which] = true; else delete e[which];
        if (!Object.keys(e).length) delete b.tableStyles[blockId];
        if (!Object.keys(b.tableStyles).length) delete b.tableStyles;
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
     * The editors are text boxes, so what arrives is a string — and it ends up inside a
     * LaTeX length, which is past the last of this file's escaping. Everything that is
     * not a number in range becomes 0, and 0 is stored as absence.
     * @returns {number} 0 when there is no usable measurement
     */
    function mmValue(v) {
      var n = Number(String(v == null ? '' : v).replace(/\s|mm$/gi, ''));
      if (!isFinite(n) || n <= 0) return 0;
      return Math.round(Math.min(n, MAX_SPACE_MM) * 100) / 100;
    }

    /**
     * @param {string} sectionId @param {'para'|'table'|'rule'|'pagebreak'|'space'} kind
     * @param {number} [at]  insert position; appended when omitted
     */
    function addPart(sectionId, kind, at) {
      if (!P()) return errNoProject();
      if (!findSection(P(), sectionId)) return err('Unknown section.', sectionId);
      if (['para', 'table', 'rule', 'pagebreak', 'space'].indexOf(kind) === -1) return err('Unknown part type "' + kind + '".');
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
          // use, because this is where a text box's contents enter the project — and
          // they leave it as a LaTeX length. Zero is no measurement, so it is absence.
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
      setBlockLevel: setBlockLevel, setBlockCentre: setBlockCentre, setMetaField: setMetaField,
      // SEC-4: per-section placement — centring, a page of its own, out of the contents.
      setBlockFlag: setBlockFlag,
      // SPC-1: …and how far down the page its heading starts.
      setBlockSpace: setBlockSpace, mmValue: mmValue,
      DEFAULT_SPACE_MM: DEFAULT_SPACE_MM, MAX_SPACE_MM: MAX_SPACE_MM,
      setTitleBlock: setTitleBlock,
      // CLS-1: the classification banner, which is a document decision, not a per-run one.
      setClassification: setClassification,
      // NAM-1 / SEC-1 / TBS-1: a section's name, its introduction, its table styling.
      setBlockName: setBlockName, setBlockHeading: setBlockHeading, setBlockIntro: setBlockIntro,
      setBlockIntroNumbered: setBlockIntroNumbered, setBlockTableStyle: setBlockTableStyle,
      // TBL-1: a generated table's own title row, caption and column headings.
      setTableText: setTableText, setTableColumnLabel: setTableColumnLabel, ONE_TABLE: '_all',
      setTableNoCaption: setTableNoCaption,
      // OPT-2: what the report is made of, stored with the report rather than the session.
      setReportInclude: setReportInclude, INCLUDE_MAPS: INCLUDE_MAPS,
      addSection: addSection, updateSection: updateSection, removeSection: removeSection,
      addPart: addPart, updatePart: updatePart, removePart: removePart, movePart: movePart,
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
        if (['para', 'table', 'rule', 'pagebreak'].indexOf(p.kind) === -1) {
          issues.push(issue('error', 'Unknown part kind "' + p.kind + '".', l)); ok = false; return;
        }
        if (p.kind === 'para' && p.text !== undefined && typeof p.text !== 'string') {
          issues.push(issue('error', 'A paragraph\'s text must be a string.', l)); ok = false;
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
   * MODULE: App.ui.mdPreview  — PRV-1: markdown -> HTML for the live preview
   * PURPOSE: Render the EXACT markdown the Generate button downloads into browsable
   *          HTML, plus the outline needed to navigate it. Not a general markdown
   *          implementation — it reads the dialect App.md emits, and nothing else.
   * PURITY:  pure (string -> {html, outline}). No DOM access; the caller mounts it.
   * DEPENDS: App.util.html (esc)
   * INVARIANTS: every path escapes before it emits. A preview that rendered raw
   *             document text as markup would be an injection route from a captured
   *             device string straight into the tool's own DOM.
   * ============================================================================= */
  (function (App) {
    'use strict';
    var esc = App.util.html.esc;

    /* -------------------------------------------------------------------------
     * Why a hand-written renderer rather than a library.
     *
     * No network and no imports (spec §3), so a markdown library would have to be
     * vendored whole — and a general one would be several thousand lines to render a
     * dialect this file already controls both ends of. What is actually needed is
     * narrow: the headings, tables, rules, page breaks and inline spans App.md emits,
     * with the escaping read back so `\_` shows as an underscore rather than as a
     * backslash. Anything outside that dialect is shown as literal text, which is the
     * safe direction to fail in.
     * ---------------------------------------------------------------------- */

    // Placeholder sentinels. U+0000 cannot appear in the document (App.md would have
    // escaped or dropped it), so a placeholder can never collide with content.
    var NUL = ' ';
    function ph(kind, n) { return NUL + kind + n + NUL; }

    /**
     * Inline spans. Order matters and is load-bearing:
     * code spans are lifted out first so nothing inside them is interpreted; the
     * backslash escapes come out next, BEFORE HTML-escaping, because after escaping
     * `\&` has become `\&amp;` and the pair is no longer recognisable; and emphasis
     * runs last, on text where every escaped asterisk has already been removed from
     * play — which is what stops `50\%` or a package name from starting italics.
     */
    function inline(s) {
      var store = [];
      var out = String(s == null ? '' : s);

      // 1. code spans (variable-length fence, optional one-space padding)
      out = out.replace(/(`+)( ?)([\s\S]*?)\2\1/g, function (m, f, pad, body) {
        store.push('<code>' + esc(body) + '</code>');
        return ph('S', store.length - 1);
      });
      // 2. hard line break: a lone backslash at end of line (App.md's {{br}})
      out = out.replace(/\\\n/g, function () {
        store.push('<br>');
        return ph('S', store.length - 1);
      });
      /* REF-2: an empty span is a LANDING POINT, not text.
       *
       * `[]{#ctl-ahg-001}` is pandoc's empty-span syntax; it becomes `\hypertarget{…}{}`
       * on the page and prints nothing. Every row of the control-coverage table carries
       * one so a mention of that control can link to its row, and the preview was
       * printing it verbatim — "[]{#ctl-ahg-001} AHG-001" — because nothing here knew
       * what it was. It is rendered here as what it is on the page: an anchor of no
       * width, so the link still lands and the reader sees "AHG-001" alone.
       *
       * Inline rather than in the block walker, which already consumes one on a line of
       * its OWN: inside a table cell it is one line of several and never reaches that. */
      /* The newline after it is machinery too, and is taken with it (D-061).
       *
       * An anchor sits on a line of its OWN inside a cell, so that it costs the column no
       * width — the line break is part of how it is written, not something the writer
       * asked for. Folding a cell's lines used to happen before this pass and swallowed
       * it; now that the fold happens after, it has to be consumed here or every anchored
       * row would start with a space that is not on the page. */
      out = out.replace(/\[\]\{#([A-Za-z0-9_-]+)\}[ \t]*\n?/g, function (m, id) {
        store.push('<span class="prv-anchor" id="' + esc(id) + '"></span>');
        return ph('S', store.length - 1);
      });
      // 3. backslash escapes -> the literal character, parked out of reach
      out = out.replace(/\\([\\`*_{}\[\]<>#|$&^~%+\-=.!()])/g, function (m, ch) {
        store.push(esc(ch));
        return ph('S', store.length - 1);
      });
      // 4. now safe to HTML-escape everything that is left
      out = esc(out);
      // 5. links (cross-references), then emphasis
      out = out.replace(/\[([^\]]*)\]\(#([A-Za-z0-9_-]+)\)/g, function (m, text, anchor) {
        return '<a href="#' + esc(anchor) + '" data-prv-jump="' + esc(anchor) + '">' + text + '</a>';
      });
      out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      // 6. put the parked pieces back
      return out.replace(new RegExp(NUL + 'S(\\d+)' + NUL, 'g'), function (m, i) { return store[Number(i)]; });
    }

    /**
     * The plain-text reading of a markdown fragment: escapes undone, code fences and
     * emphasis markers removed. For anywhere the text is shown as text rather than
     * rendered as markup — the outline rail, a tooltip, a title attribute.
     */
    function unescapeMd(s) {
      return String(s == null ? '' : s)
        .replace(/`+( ?)([\s\S]*?)\1`+/g, '$2')                       // code spans -> their content
        .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1')
        .replace(/\\([\\`*_{}\[\]<>#|$&^~%+\-=.!()])/g, '$1');
    }

    /** Split a cell row on unescaped pipes, dropping the leading/trailing delimiters. */
    /* D-061: the padding is spaces and tabs, and NOTHING else.
     *
     * `String.trim()` also strips U+00A0, which App.md emits as the line a trailing line
     * break lands on (BR-1) — so a cell whose last line was that spacer had it trimmed to
     * nothing, the empty line was then dropped as padding, and the break's own backslash
     * was left as the cell's last character with nothing to break. The literal backslash
     * D-037/D-059 were about, in the cell path this time. Pandoc's own rule is spaces and
     * tabs; a non-breaking space is content. */
    function padTrim(s) { return String(s == null ? '' : s).replace(/^[ \t]+|[ \t\r]+$/g, ''); }
    function cells(line) {
      var parts = [], cur = '';
      for (var i = 0; i < line.length; i++) {
        var c = line.charAt(i);
        if (c === '\\' && i + 1 < line.length) { cur += c + line.charAt(++i); continue; }
        if (c === '|') { parts.push(cur); cur = ''; continue; }
        cur += c;
      }
      parts.push(cur);
      if (parts.length && !parts[0].trim()) parts.shift();
      if (parts.length && !parts[parts.length - 1].trim()) parts.pop();
      return parts.map(padTrim);
    }

    /* TW-1/TBS-1/CAP-1: the preview earns its keep only if it shows the PDF.
     *
     * Three things the generated markdown now carries have to be read back rather than
     * shown as source, or the preview would describe a different document from the one
     * the Generate button downloads:
     *
     *   * column WIDTHS, which live in the dash counts of a grid table's border row and
     *     come back out as a `<colgroup>`;
     *   * SHADING, which travels as raw-LaTeX fences around the table and a raw-LaTeX
     *     span at the head of each first-column cell — both invisible in the PDF's
     *     source sense, so both are folded into a CSS class rather than printed;
     *   * the CAPTION's number, which LaTeX supplies and the markdown therefore does
     *     not contain (see App.doc). The preview counts tables the same way, so
     *     "Table 3" here is "Table 3" there.
     */
    var COL_SHADE_RE = /^`\\chTblColShade`\{=latex\}\s*/;
    // FNT-6: the first column's size travels the same way and is stripped the same way.
    // Its effect is on the paper's stylesheet, which states it against every table's
    // first column — so unlike the shade there is no per-table class to set from it.
    var COL_FONT_RE = /^`\\chTblColFont`\{=latex\}\s*/;
    // TBL-1: the same span on a header cell, which a table with a title row carries
    // because the one `\rowcolor` `\toprule` can hold has gone to the title. Machinery,
    // so it is stripped rather than shown — the shading is already on the group's class.
    var HEAD_CELL_RE = /^`\\chTblHeadCell`\{=latex\}\s*/;
    /* SPC-1: the row-height strut, at the END of the first cell rather than the head of
     * it. Machinery like the three above and stripped like them — but unlike them it is
     * read for its NUMBER first, because what it does on the page is the row's height,
     * and a preview that showed the words without the height would be showing a
     * different table. */
    var ROW_STRUT_RE = /\s*`\\rule\[-([\d.]+)mm\]\{0pt\}\{0pt\}`\{=latex\}\s*$/;

    /**
     * One table cell, rendered the way the PAGE will render it.
     *
     * A grid-table cell is not a run of lines, it is a run of PARAGRAPHS: pandoc folds
     * consecutive lines into one (so a wrapped sentence is one sentence) and a blank
     * line between them starts a new one. Rendering the lines verbatim collapsed the
     * whole cell into a single blob, which is what ran a firewall rule list together —
     * each rule is a paragraph, and the blank lines that separate them were the only
     * thing saying so.
     *
     * D-061: folding the lines BEFORE `inline()` destroyed the one thing a hard break
     * is written as. A cell's break is a trailing backslash and a newline (RTX-2/D-060),
     * exactly as a paragraph's is — join the lines with a space first and the pair is
     * `\` followed by a space, which no rule here recognises, so the break vanished and
     * the backslash printed. It was at its most visible in a cell holding nothing else:
     * an otherwise empty box with a lone `\` in it. So the folding happens AFTER the
     * inline pass, on the lines it did not claim.
     */
    function cellHtml(s) {
      var parts = String(s == null ? '' : s).split(/\n{2,}/)
        .map(function (p) { return inline(p).split('\n').join(' ').trim(); })
        .filter(function (p) { return p.length; });
      // One paragraph is the overwhelming case and gets no wrapper — a cell holding a
      // single value should be a cell holding a single value, in the markup as well.
      if (parts.length < 2) return parts[0] || '';
      return '<div class="prv-cp">' + parts.join('</div><div class="prv-cp">') + '</div>';
    }

    function tableHtml(head, rows, opts) {
      opts = opts || {};
      var shadeCol = false, rowMm = [];
      var body = rows.map(function (r, ri) {
        return (r || []).map(function (c, i) {
          if (i !== 0) return c;
          var stripped = String(c == null ? '' : c).replace(COL_SHADE_RE, '');
          if (stripped !== c) shadeCol = true;
          // SPC-1: read the height off the strut, then take the strut out. Per ROW, not
          // per table — the rows that were ticked carry one and the rest do not.
          var m = ROW_STRUT_RE.exec(stripped);
          if (m) { rowMm[ri] = Number(m[1]) || 0; stripped = stripped.replace(ROW_STRUT_RE, ''); }
          return stripped.replace(COL_FONT_RE, '');
        });
      });
      var cls = 'prv-table' + (opts.shadeHead ? ' prv-shade-head' : '') + (shadeCol ? ' prv-shade-col' : '');
      // TW-3: a table narrower than the page is drawn narrower, and centred, as it will
      // be — the whole reason for allowing the widths not to fill the line.
      var scale = (opts.scale > 0 && opts.scale < 0.995) ? opts.scale : 0;
      var wrapStyle = scale ? ' style="width:' + (Math.round(scale * 1000) / 10) + '%;margin:8px auto"' : '';
      var group = (opts.widths && opts.widths.length === head.length)
        ? '<colgroup>' + opts.widths.map(function (w) { return '<col style="width:' + (Math.round(w * 10000) / 100) + '%">'; }).join('') + '</colgroup>'
        : '';
      /* TBL-1: the title row, as the merged header row it is on the page.
       *
       * Pandoc reads a grid-table row whose internal `|` are omitted as a cell spanning
       * those columns and writes it as `\multicolumn` — so this IS a table row, and the
       * preview draws it as one. It was a paragraph balanced on top of the table for two
       * rounds, which could never be the right width.
       */
      var title = opts.titleRow
        ? '<tr class="prv-tbltitle"><th colspan="' + head.length + '">' + cellHtml(opts.titleRow) + '</th></tr>'
        : '';
      var h = title + '<tr>' + head.map(function (c) {
        return '<th>' + cellHtml(String(c == null ? '' : c).replace(HEAD_CELL_RE, '')) + '</th>';
      }).join('') + '</tr>';
      /* SPC-1: the strut's millimetres go BELOW the cell's content, as an empty block
       * inside the first cell — not as a height on the row.
       *
       * A row height would be a MINIMUM (max(natural, asked)); the strut on the page is
       * additive (the content, then its depth underneath). An empty box would look the
       * same either way and a box with a label in it would not, which is exactly the
       * case — "Signed:" with 25mm of writing room under it. The cells align to the top
       * for the same reason: that is where the depth strut leaves them.
       *
       * Per row: only the rows that were ticked carry a strut, and a row without one is
       * drawn exactly as it always was.
       */
      var anyStrut = rowMm.some(function (v) { return v > 0; });
      var b = body.map(function (r, ri) {
        var px = App.docFormat.mmPx(rowMm[ri]);
        var strut = px ? '<div class="prv-strut" style="height:' + px + 'px"></div>' : '';
        return '<tr' + (anyStrut ? ' style="vertical-align:top"' : '') + '>' +
          r.map(function (c, i) { return '<td>' + cellHtml(c) + (i === 0 ? strut : '') + '</td>'; }).join('') + '</tr>';
      }).join('');
      var cap = opts.caption
        ? '<div class="prv-caption"><strong>Table ' + (opts.number || '') + ':</strong> ' + inline(opts.caption) + '</div>'
        : '';
      return '<div class="prv-tablewrap"' + (opts.anchor ? ' id="' + esc(opts.anchor) + '"' : '') + wrapStyle + '>' +
        '<table class="' + cls + '"' + (group ? ' style="table-layout:fixed;width:100%"' : '') + '>' + group +
        '<thead>' + h + '</thead><tbody>' + b + '</tbody></table>' + cap + '</div>';
    }

    /** Strip the YAML metadata block. @returns {{yaml:string, body:string}} */
    function splitFrontMatter(md) {
      var s = String(md == null ? '' : md);
      if (s.slice(0, 4) !== '---\n') return { yaml: '', body: s };
      var end = s.indexOf('\n---\n', 3);
      if (end === -1) return { yaml: '', body: s };
      return { yaml: s.slice(4, end), body: s.slice(end + 5) };
    }

    /**
     * @param {string} md  a complete generated document
     * @returns {{html:string, outline:Array<{level:number,number:string,title:string,anchor:string}>}}
     */
    function toHtml(md, state, opts) {
      // The table counter is shared with a nested render (a centred block re-enters
      // here) so numbering runs through the document rather than restarting inside one.
      state = state || { tables: 0 };
      // SEC-4: which heading levels start a page — the profile's, passed in by the caller.
      if (opts && opts.breaks) state.breaks = opts.breaks;
      var split = splitFrontMatter(md);
      // The centred form is a pair of raw-LaTeX fences (see App.md.centred — a fenced
      // div does not survive to LaTeX). Fold them back into the div form so the block
      // walker below has one shape to handle rather than a cross-block state machine.
      var body = split.body
        .replace(/```\{=latex\}\n\\begin\{center\}\n```/g, '::: {.center}')
        .replace(/```\{=latex\}\n\\end\{center\}\n```/g, ':::');
      var lines = body.split('\n');
      var out = [], outline = [], i = 0;

      /* BR-1: what counts as a blank line, and why `.trim()` is the wrong test.
       *
       * A markdown blank line is a line of ASCII spaces and tabs. `String.trim()` also
       * strips every Unicode space separator — including U+00A0, which App.md emits as
       * the line a TRAILING line break lands on. Read as blank, that line was dropped
       * and the paragraph ended on the break's own backslash, which is the literal
       * backslash D-037 was about, back again in the preview alone. Pandoc's own
       * blank-line rule is spaces and tabs, so this is it. */
      function isBlank(l) { return !/[^ \t\r]/.test(l); }

      function paragraphAt() {
        var buf = [];
        while (i < lines.length && !isBlank(lines[i]) && !isBlockStart(lines[i])) buf.push(lines[i++]);
        return buf.length ? '<p>' + inline(buf.join('\n')) + '</p>' : '';
      }
      function isBlockStart(l) {
        return /^#{1,6}\s/.test(l) || /^\|/.test(l) || /^\+[-=:+]/.test(l) ||
          /^(\* \* \*|:::|```)/.test(l) || /^:\s/.test(l);
      }

      // A bare `[]{#id}` line is a table's anchor, emitted just before it.
      var pendingAnchor = '';
      // TBS-1: set by the raw-LaTeX fence that opens a shaded-header group, consumed by
      // the next table, cleared by the fence that closes the group.
      var pendingShadeHead = false;
      // TW-3: the fraction of the page the next table occupies (1 = the full width).
      var pendingScale = 1;
      // CAP-3: the paragraph currently being read is a table caption.
      var inCaption = false;
      // TTL-3: set by \chTitleStyle, consumed by the heading it precedes — which is the
      // same span the two macros cover on the page.
      var pendingTitle = false;
      // CTR-1: set by the centring declaration, consumed by the heading it precedes.
      var pendingCentreHead = false;
      // TOC-1: where in `out` a contents list has to be dropped once the walk is done.
      var tocAt = [];
      while (i < lines.length) {
        var line = lines[i];
        if (isBlank(line)) { i++; continue; }
        var anch = /^\[\]\{#([A-Za-z0-9_-]+)\}\s*$/.exec(line);
        if (anch) { pendingAnchor = anch[1]; i++; continue; }

        // --- heading, with its pandoc {#anchor} attribute
        // The attribute block may carry classes as well as the id (TOC-1 marks the
        // contents heading `.unnumbered .unlisted`), so anything after the id is
        // consumed rather than left to be printed as part of the title.
        var h = /^(#{1,6})\s+(.*?)(?:\s*\{#([A-Za-z0-9_-]+)((?:\s+[^}]*)?)\})?\s*$/.exec(line);
        if (h) {
          var lvl = h[1].length, raw = h[2], anchor = h[3] || '';
          // SEC-4/TOC-1: `.unlisted` is what keeps a heading out of the contents list on
          // the page, so it is what keeps it out of the preview's list too.
          var unlisted = /\.unlisted\b/.test(h[4] || '');
          var num = (/^([\d.]+)\s+/.exec(raw) || [])[1] || '';
          // The outline is plain TEXT — it goes into the navigation rail, where it is
          // HTML-escaped and never parsed as markdown. So the markdown escaping has to
          // come off first, or a section called "Firmware & build" is listed as
          // "Firmware \& build". The heading itself still goes through inline().
          outline.push({ level: lvl, number: num, title: unescapeMd(raw.replace(/^[\d.]+\s+/, '')), anchor: anchor, unlisted: unlisted });
          // TTL-3: a title is an h1 wearing the profile's title styling rather than its
          // H1 styling — the same swap \chTitleStyle makes on the page.
          /* SEC-4: a heading whose LEVEL starts a page is marked as one.
           *
           * That break lives in the formatting profile and reaches the PDF as titlesec's
           * `\sectionbreak` — there is no `\newpage` in the markdown to find, so the
           * paged preview never broke at all and showed a document running on past the
           * bottom of every sheet. `state.breaks` carries the profile's answer in. */
          var breaks = (state.breaks || {})[pendingTitle ? 0 : lvl];
          var hcls = (pendingTitle ? 'prv-h prv-title' : 'prv-h prv-h' + lvl) +
            (pendingCentreHead ? ' prv-centre' : '') + (breaks ? ' prv-breakbefore' : '');
          pendingTitle = false;
          pendingCentreHead = false;
          out.push('<h' + lvl + (anchor ? ' id="' + esc(anchor) + '"' : '') + ' class="' + hcls + '">' + inline(raw) + '</h' + lvl + '>');
          i++; continue;
        }
        // --- raw-LaTeX page break
        if (/^```\{=latex\}/.test(line)) {
          var fence = [];
          i++;
          while (i < lines.length && !/^```\s*$/.test(lines[i])) fence.push(lines[i++]);
          i++;
          var raw = fence.join('\n');
          // TBS-1: the shading group is machinery, not content. Showing it as "Raw
          // LaTeX" would put a block in the preview that has no counterpart on the page.
          // TW-3/TBS-1: the table group carries the narrowing and the shading. Both are
          // machinery, not content — shown as "Raw LaTeX" they would put a block in the
          // preview with no counterpart on the page.
          var narrow = /\\setlength\{\\columnwidth\}\{([\d.]+)\\columnwidth\}/.exec(raw);
          if (narrow || /\\chTblHeadShade/.test(raw)) {
            pendingShadeHead = /\\chTblHeadShade/.test(raw);
            pendingScale = narrow ? Number(narrow[1]) : 1;
            continue;
          }
          if (/^\s*\\endgroup\s*$/.test(raw)) { pendingShadeHead = false; pendingScale = 1; continue; }
          // CAP-3: the caption is a paragraph between two macros. Both are machinery;
          // what they mark is that the paragraph between them is a caption, wherever it
          // sits — which is how the preview shows a caption above a table as readily as
          // one below, without knowing which the profile asked for.
          if (/^\s*\\chCaptionOpen\s*$/.test(raw)) { inCaption = true; continue; }
          if (/^\s*\\chCaptionClose\s*$/.test(raw)) { inCaption = false; continue; }
          // TTL-3: the pair around a title's heading. Machinery, like the two above —
          // what they carry is which styling the heading between them wears.
          if (/^\s*\\chTitleStyle(Centred)?\s*$/.test(raw)) {
            pendingTitle = true;
            // CTR-1: the centred face of the same declaration.
            if (/Centred/.test(raw)) pendingCentreHead = true;
            continue;
          }
          if (/^\s*\\chSectionStyle\s*$/.test(raw)) { pendingTitle = false; continue; }
          // CTR-1: a centred heading at an ordinary level — a pair of \titleformat
          // declarations either side of it, exactly as the title uses.
          if (/^\s*\\chCentre(One|Two|Three|Four)\s*$/.test(raw)) { pendingCentreHead = true; continue; }
          if (/^\s*\\chPlain(One|Two|Three|Four)\s*$/.test(raw)) { pendingCentreHead = false; continue; }
          // TOC-1: the contents list is filled in at the end, when every heading this
          // document contains has been seen — a list at the front cannot be written
          // until the back has been read.
          if (/^\s*\\chContents\s*$/.test(raw)) { tocAt.push(out.length); out.push(''); continue; }
          /* SPC-1: a measured gap is CONTENT of a sort — it is the thing the author put
           * there — so it is drawn at its size rather than announced as machinery. The
           * millimetres become pixels at 96dpi, which is the scale the paper itself is
           * drawn at (App.docFormat.textWidthPx), so a 40mm gap is 40mm of this page. */
          var gap = /^\s*(?:\\vspace\*?|\\chGap(?:Title|One|Two|Three|Four))\{([\d.]+)mm\}\s*$/.exec(raw);
          if (gap) {
            out.push('<div class="prv-space" style="height:' + App.docFormat.mmPx(gap[1]) + 'px"></div>');
            continue;
          }
          out.push('<div class="prv-pagebreak"><span>' + (/(\\newpage)/.test(raw) ? 'Page break' : 'Raw LaTeX') + '</span></div>');
          continue;
        }
        // --- centred div
        /* CTR-1: centred blocks NEST, and the walker has to count.
         *
         * A paragraph centred inside a section that is itself centred emits two `center`
         * environments, one inside the other — harmless on the page, and quietly
         * catastrophic here: the walker stopped at the first closing `:::`, which left
         * the OUTER close as a bare `:::` line. `/^:::/` matched it as an OPENING fence,
         * so it swallowed the entire rest of the document into a centred div — which is
         * what "centring my title page centres the whole document" was.
         *
         * It is also why the paged preview stopped after two sheets: with the document
         * folded into one enormous block, there was one thing to place and nothing to
         * break between.
         */
        if (/^:::\s*\{/.test(line)) {
          var inner = [], depth = 1;
          i++;
          while (i < lines.length) {
            if (/^:::\s*\{/.test(lines[i])) depth++;
            else if (/^:::\s*$/.test(lines[i])) { depth--; if (!depth) break; }
            inner.push(lines[i++]);
          }
          i++;
          var nested = toHtml(inner.join('\n'), state);
          // CTR-1: a centred block can now contain a HEADING (centring a section centres
          // its heading), and the nested render's outline was being thrown away — so a
          // centred section vanished from the navigation rail and from the contents list
          // while still printing on the page.
          nested.outline.forEach(function (o) { outline.push(o); });
          out.push('<div class="prv-centre">' + nested.html + '</div>');
          continue;
        }
        // A closing fence with nothing open is machinery left over from a block this
        // walker did not open. It is not content, and it must not be read as an opener.
        if (/^:::\s*$/.test(line)) { i++; continue; }
        // --- horizontal rule
        if (/^\* \* \*\s*$/.test(line)) { out.push('<hr class="prv-rule">'); i++; continue; }
        // --- pipe table
        if (/^\|/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
          var head = cells(line), rows = [];
          i += 2;
          while (i < lines.length && /^\|/.test(lines[i])) rows.push(cells(lines[i++]));
          out.push(tableWithCaption(head, rows, null));
          continue;
        }
        // --- grid table (the multi-line-cell form)
        // `+:` as well as `+-`: an aligned column carries its marker in the border, and
        // reading only the unaligned form left every aligned grid table shown as prose.
        if (/^\+[-=:+]/.test(line)) {
          var block = [];
          while (i < lines.length && (/^[+|]/.test(lines[i]))) block.push(lines[i++]);
          var g = parseGrid(block);
          out.push(tableWithCaption(g[0], g[1], g[2], g[3]));
          continue;
        }
        if (inCaption) {
          var capText = paragraphAt() || (i++, '');
          pendingAnchor = '';
          // "Table 3:" is emphasised the way LaTeX emphasises a caption label, and the
          // number comes from the text rather than from a counter kept here — the
          // document has already been numbered, and counting again could only disagree.
          out.push(capText ? '<div class="prv-caption">' +
            capText.replace(/^<p>(Table [\d.]+:)/, '<strong>$1</strong>').replace(/^<p>|<\/p>$/g, '') + '</div>' : '');
          continue;
        }
        /* REF-1: a `[]{#id}` line before a PARAGRAPH is that paragraph's anchor.
         *
         * It used to be read only as a table's anchor, so a paragraph anchor was held
         * and then silently attached to whatever table came next — the preview's links
         * landed somewhere the PDF's do not. Consumed here, it lands on the paragraph
         * exactly as pandoc's `\hypertarget` does. */
        var para = paragraphAt() || (i++, '');
        if (para && pendingAnchor) {
          para = para.replace(/^<p>/, '<p id="' + esc(pendingAnchor) + '">');
          pendingAnchor = '';
        }
        out.push(para);
      }

      // TOC-1: every heading is known now, so a contents list can be written wherever
      // the document asked for one.
      tocAt.forEach(function (at) { out[at] = tocHtml(outline); });

      /** A table may be followed by `: caption` — pandoc's caption syntax. The id, if
       *  any, came in on the `[]{#id}` line before the table. */
      function tableWithCaption(head, rows, widths, titleRow) {
        var cap = '', anchor = pendingAnchor;
        pendingAnchor = '';
        var j = i;
        while (j < lines.length && isBlank(lines[j])) j++;
        var m = j < lines.length ? /^:\s+(.*?)(?:\s*\{#([A-Za-z0-9_-]+)\})?\s*$/.exec(lines[j]) : null;
        if (m) { cap = m[1]; anchor = m[2] || anchor; i = j + 1; }
        // Only a CAPTIONED table is numbered — by LaTeX on the page, and here for the
        // same reason and in the same order (CAP-1).
        var n = cap ? ++state.tables : 0;
        return tableHtml(head, rows, { caption: cap, anchor: anchor, number: n, widths: widths,
          shadeHead: pendingShadeHead, scale: pendingScale, titleRow: titleRow || '' });
      }

      return { html: out.filter(Boolean).join('\n'), outline: outline };
    }

    /**
     * TOC-1: the contents list, from the headings the document turned out to have.
     *
     * The page numbers are LaTeX's and cannot be known here — a browser has no pages —
     * so the preview shows the entries and their nesting, which is the part a designer
     * is actually deciding when they move a section or change its level.
     */
    function tocHtml(all) {
      // SEC-4: a section marked `.unlisted` prints its heading and is not listed —
      // the preview's list and LaTeX's `.toc` file must agree about which those are.
      var outline = all.filter(function (o) { return !o.unlisted; });
      if (!outline.length) return '<div class="prv-toc prv-toc-empty"><em>No headings yet.</em></div>';
      return '<div class="prv-toc">' + outline.map(function (o) {
        return '<div class="prv-toc-e prv-toc-' + (o.level || 1) + '">' +
          (o.number ? '<span class="prv-toc-n">' + esc(o.number) + '</span> ' : '') +
          esc(o.title) + '</div>';
      }).join('') + '</div>';
    }

    /**
     * Read a grid table back into head + rows. Cell text that spanned several lines is
     * rejoined with a newline, which inline() then renders as a line break — so the
     * preview shows the same shape the PDF will.
     */
    function parseGrid(block) {
      var seps = [], rows = [], headRows = [], seenHead = false, cur = [];
      block.forEach(function (l) {
        if (/^\+/.test(l)) {
          if (cur.length) {
            var merged = cur[0].map(function (_, c) {
              // D-061: spaces and tabs are padding; a non-breaking space is content (see
              // padTrim), and it is what a trailing line break lands on.
              var lines = cur.map(function (r) { return padTrim(r[c] || ''); });
              // Only the TRAILING blanks are padding — a cell is as tall as the tallest
              // in its row. An INTERIOR blank is a paragraph break the author or the
              // value formatter put there, and dropping it ran a list of firewall rules
              // together into one paragraph.
              while (lines.length && !lines[lines.length - 1].length) lines.pop();
              return lines.join('\n');
            });
            // TBL-1: EVERY row above the `=` separator is a header row, not just the
            // last one — a table with a title row has two, and reading only the last
            // left the title standing in as the header and the headings as a body row.
            if (!seenHead) headRows.push(merged); else rows.push(merged);
            if (/^\+:?=/.test(l)) seenHead = true;
            cur = [];
          }
          seps.push(l);
          return;
        }
        cur.push(cells(l));
      });
      if (cur.length) rows.push(cur[0]);
      if (!headRows.length) headRows = [rows.shift() || []];
      /* The widths come from a border with all its joins in it. With a title row the
       * FIRST border spans the table and has none, so it would report one column.
       *
       * `> 3`, not `> 2`: the outer `+` at each end already contributes an empty string
       * either side, so a border with no INTERNAL join splits into three parts and was
       * being taken as the width row. `gridWidths` then found one segment, gave up and
       * returned null, and every table with a title row lost its column widths in the
       * preview while keeping them on the page. */
      var sep = seps.filter(function (x) { return x.split('+').length > 3; })[0] || seps[0];
      // A header row with fewer cells than the table has columns is the spanning one.
      var cols = headRows[headRows.length - 1].length;
      var title = (headRows.length > 1 && headRows[0].length === 1) ? headRows[0][0] : '';
      return [headRows[headRows.length - 1], rows, gridWidths(sep), title, cols];
    }

    /**
     * TW-1: the column fractions pandoc will read out of a border row, read out of it
     * here the same way — each segment's length over the whole line — so the preview's
     * columns and the PDF's are the same numbers rather than two guesses at them.
     * @returns {?number[]} null when the row is unreadable
     */
    function gridWidths(sep) {
      if (!sep || !/^\+/.test(sep)) return null;
      var segs = sep.slice(1, -1).split('+');
      if (segs.length < 2) return null;
      var total = sep.length, out = [], ok = true;
      segs.forEach(function (s) {
        if (!/^[-=:]+$/.test(s)) ok = false;
        out.push((s.length + 1) / total);
      });
      return ok ? out : null;
    }

    App.ui = App.ui || {};
    App.ui.mdPreview = { toHtml: toHtml, splitFrontMatter: splitFrontMatter, _inline: inline, _cells: cells,
      gridWidths: gridWidths, unescapeMd: unescapeMd, _cellHtml: cellHtml };
  })(App);

  /* =============================================================================
   * MODULE: App.ui.richText  — RTX-1: the box shows what it holds
   * PURPOSE: Turn the {{...}} token markup App.md.rich reads into HTML a
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
     * document is markdown on its way to LaTeX, and HTML would need a second writer, a
     * second escaping discipline and a second set of things that can go wrong on the way
     * to a PDF — for a box that is only ever used to write four kinds of emphasis.
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
      if (node.nodeType === 3) { emit('text', node.nodeValue || '', node); return; }
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

    App.ui = App.ui || {};
    App.ui.richText = {
      toHtml: toHtml, fromNode: fromNode, selectionIn: selectionIn, offsetOf: offsetOf,
      placeCaret: placeCaret, applyToken: applyToken, CHIP: CHIP, REFLINK: REFLINK
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
   *          App.docStore, App.docTemplates, App.ui.mdPreview,
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
      { id: 'section', label: 'Section' },
      { id: 'relevance', label: 'Relevance' },
      { id: 'formatting', label: 'Formatting' },
      // HDR-1: the running header and footer are a big enough question — six slots, a
      // different first page, and the classification banner — to be their own pane
      // rather than a fourth fieldset under Formatting.
      { id: 'headerfooter', label: 'Header & Footer' },
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
      pages: false,          // PRV-4: is the preview showing sheets of paper?
      selected: null,        // block id being edited in the Section pane
      fmtId: null,           // profile being edited in the Formatting pane
      conflict: null,        // { kindKey, plan, decisions } while an import is being resolved
      refFor: null,          // part id whose "insert reference" menu is open
      optMenu: null,         // block id whose columns/groups menu is open (OPT-1)
      preview: null          // cached { html, outline } so switching panes is not a re-generate
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
    /** The host's sections BOUND to what is being previewed, filter and all. */
    function runSections(selId) {
      return App.docHost.sections({ subjectId: selId, categories: opts().relevance || null });
    }
    /**
     * How many rows sit in each of the host's filter categories, for the omission note
     * and the tick list beside it. Counted UNFILTERED — the whole point is to say how
     * many the filter is leaving out.
     */
    function categoryCounts(selId) {
      var h = H(); if (!h || !selId || !h.filter) return {};
      var rows = [];
      App.docHost.sections({ subjectId: selId, categories: null }).forEach(function (pv) {
        if (typeof pv.rows === 'function') rows = rows.concat(pv.rows());
      });
      return App.docGen.filterCounts(h, rows);
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
          clampSkips: profile.headings.clampSkips !== false,
          numbered: profile.headings.numbered !== false
        }),
        profile: profile
      };
    }

    // ======================================================================
    // RD-1: the section list
    // ======================================================================

    var LEVEL_OPTS = [{ value: '', label: 'Auto' }].concat(App.doc.LEVELS.map(function (l) {
      return { value: String(l.value), label: l.label };
    }));

    function levelSelect(b, resolvedFor) {
      var cur = b.level == null ? '' : String(b.level);
      var shown = resolvedFor ? resolvedFor.level : null;
      var title = b.level == null
        ? 'Automatic — currently ' + (shown === App.doc.BODY_LEVEL ? 'normal text' : App.doc.levelLabel(shown)) + '. Pick a level to pin it.'
        : 'Pinned. Choose Auto to let it follow the section above.';
      return '<select class="rd-level" data-rd-level="' + esc(b.id) + '" title="' + esc(title) + '" aria-label="Heading level for ' + esc(b.label) + '">' +
        LEVEL_OPTS.map(function (o) {
          var label = (o.value === '' && shown != null)
            ? 'Auto (' + App.doc.levelLabel(shown) + ')'
            : o.label;
          return '<option value="' + o.value + '"' + (o.value === cur ? ' selected' : '') + '>' + esc(label) + '</option>';
        }).join('') + '</select>';
    }

    /**
     * OPT-1: a section's columns and groups, on the section ROW rather than in the
     * Section pane.
     *
     * They were in the pane, which meant switching what a register carries cost a trip
     * away from whatever was on the right — and the pane worth being on while doing it
     * is the Preview, which is exactly the one you had to leave. On the row they are two
     * clicks from anywhere, and the pane behind them does not move.
     *
     * @returns {string} '' when the section has nothing to choose
     */
    function optionsMenu(project, b) {
      var cols = App.docGen.sectionColumns(H(), b, opts());
      var optional = (cols && cols.optional) || [];
      var groups = b.groups || [];
      if (!optional.length && !groups.length) return '';
      var key = b.dsId || b.kind;
      var open = _rd.optMenu === b.id;
      var body = '';
      if (groups.length) {
        body += '<div class="rd-optmenu-h">Groups</div>' + groups.map(function (g) {
          return cb('data-rd-dsmap="datasetSections" data-rd-ds="' + esc(b.dsId) + '" data-rd-key="' + esc(g.value) + '"', g.label, g.included);
        }).join('');
      }
      if (optional.length) {
        // COL-3: ticked iff the column will actually be there — which for an untouched
        // project is the column's own declaration, not a blanket yes.
        var colOpts = (opts().columns || {})[key] || {};
        body += '<div class="rd-optmenu-h">Columns</div>' + optional.map(function (c) {
          return cb('data-rd-dsmap="columns" data-rd-ds="' + esc(key) + '" data-rd-key="' + esc(c.id) + '"', c.label, App.report.columnOn(c, colOpts));
        }).join('');
      }
      return '<span class="rd-opt">' +
        '<button type="button" class="rd-optbtn' + (open ? ' on' : '') + '" data-rd-optmenu="' + esc(b.id) + '"' +
          ' aria-expanded="' + (open ? 'true' : 'false') + '"' +
          ' title="Which columns' + (groups.length ? ' and groups' : '') + ' this section carries">&#9776;</button>' +
        (open ? '<span class="rd-optmenu">' + body + '</span>' : '') + '</span>';
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
          ? '<span class="rd-warn" title="There is no heading one level above this one. It has been pulled up to H' + r.level + '.">↰ H' + r.level + '</span>'
          : '';
        var kind = b.kind === 'custom'
          ? '<span class="rd-kind rd-kind-custom">custom</span>'
          : '<span class="rd-kind">' + esc(b.kind === 'dataset' ? 'register' : b.kind) + '</span>';
        var sel = _rd.selected === b.id ? ' sel' : '';

        return '<li class="ord-step rd-row' + (off ? ' off' : '') + sel + '" draggable="true" data-rd-block="' + esc(b.id) + '">' +
          '<span class="ord-num">' + esc(num) + '</span>' +
          '<label class="ord-inc" title="Include this section in the document">' + inc + '</label>' +
          '<span class="ord-body">' +
            '<button type="button" class="rd-open" data-rd-select="' + esc(b.id) + '" title="Select this section. The pane on the right stays where it is.">' + esc(b.label) + '</button>' +
            '<span class="rd-meta">' + kind + warn + '</span>' +
          '</span>' +
          optionsMenu(project, b) +
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

      return '<div class="rpt-pane rpt-pane-main"><h4>Sections</h4>' +
        '<p class="muted rpt-note">Drag, or use ▲/▼, to set the order. The level box sets the heading — <strong>Auto</strong> makes a section a sibling of the one above it, and numbering follows the levels. ' +
        'Untick one to leave it out.</p>' +
        '<div class="rd-addbar"><button type="button" class="primary" data-rd-add-section>+ Add section</button>' + tplPicker + '</div>' +
        '<div id="rd-order-host"><ol class="ord-list">' + rows + '</ol></div></div>';
    }

    // ======================================================================
    // RD-2: the Section pane — hand-authored content, or a register's options
    // ======================================================================

    function hostileHint(text) {
      var chars = MD.hostileChars(text);
      if (!chars.length) return '';
      return '<div class="rd-esc" title="These are escaped on the way into the .md so LaTeX renders them literally. Your text is stored exactly as typed.">' +
        'Escaped for LaTeX: ' + chars.map(function (c) { return '<code>' + esc(c) + '</code>'; }).join(' ') + '</div>';
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
      try { return docCtx(project, filledView(project)).resolveRef; }
      catch (e) { return null; }        // a half-built document must not break the editor
    }

    /**
     * @param {string} attrs   the data attributes identifying what this box writes to
     * @param {string} tokens  the stored token text
     */
    function richBox(project, attrs, tokens, cls, placeholder) {
      return '<div class="rd-rich ' + (cls || '') + '" contenteditable="true" role="textbox"' +
        ' aria-multiline="true" spellcheck="true" data-rd-rich ' + attrs +
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
      // Filled, so the register tables are in the list — see filledView.
      var view = filledView(project);
      var tables = App.doc.tableIndex(view.resolved);
      var targets = App.doc.refTargets(view.resolved, tables).filter(function (t) { return t.id !== ownId; });
      if (!targets.length) return '<div class="rd-refmenu"><em>Nothing to link to yet.</em></div>';
      return '<div class="rd-refmenu">' +
        '<div class="rd-refmenu-h">Link to&hellip;</div>' +
        '<p class="muted rd-refmenu-note">Select text first to link the words you have already written. ' +
        'Otherwise pick what the link should read as — all three follow the target if it is renamed or renumbered.</p>' +
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
    function textWidthPx(profile) { return App.docFormat.textWidthPx(profile); }

    /**
     * PRV-2: a rendered document, wrapped in a page-shaped box carrying the profile's
     * own CSS — so paper, margins, font size, line spacing, heading styling, table
     * shading and caption alignment all show here rather than only in the PDF.
     *
     * The stylesheet is emitted beside the content rather than into the app's own, for
     * the reason it exists: it changes with the profile, and the workspace re-renders as
     * a string on every edit, so it stays in step by construction.
     */
    function paper(project, html, extraClass) {
      return '<style>' + App.docFormat.previewCss(App.docFormat.resolve(project)) + '</style>' +
        '<div class="rd-paper ' + (extraClass || '') + '">' + html + '</div>';
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
          '<span class="muted rd-part-note">Automatic widths — drag a column edge, or double-click a percentage to type one.</span></div>';
      }
      var t = App.docStore.widthTotal(widths);
      var msg = t.ok
        ? '<span class="muted rd-part-note">Columns total ' + t.total + '% — the table fills the page width.</span>'
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
      return '<div class="rd-fieldset"><strong>Column widths</strong>' +
        '<p class="muted">These are the columns this section’s table will have. Drag an edge to change the split, or double-click a percentage to type one. ' +
        'The strip is the page’s text width, so a set that does not fill it makes a table narrower than the page.</p>' +
        (n < 2
          ? '<p class="muted">A one-column table has no width to set.</p>'
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
          cb('data-rd-part-flag="styleHead" data-rd-part="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '"', 'Style header row', part.styleHead === true) +
          cb('data-rd-part-flag="styleFirstColumn" data-rd-part="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '"', 'Style first column', part.styleFirstColumn === true) +
          // CAP-4: a table that names itself in its own title row, or one that is simply
          // a layout, does not want "Table 7:" underneath it.
          cb('data-rd-part-flag="noCaption" data-rd-part="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '"', 'No caption', part.noCaption === true) +
          partControls(sec, part, i, n) + '</div>' +
        refMenu(project, sec, part) +
        (part.noCaption === true
          ? '<p class="muted rd-part-note">Uncaptioned, so this table takes no number and cannot be cross-referenced.</p>'
          : '<input class="rd-cap" value="' + esc(part.caption || '') + '" data-rd-caption="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '" placeholder="Table caption — left blank, the section’s heading is used" aria-label="Table caption">') +
        '<div class="rd-tablewrap"><div class="rd-tablescale" style="width:' + px + 'px">' +
          '<table class="rd-table rd-table-fixed" style="width:' + tablePx + 'px">' + group +
          '<thead><tr>' + ths + '<th class="rd-rowdel' + (rowMm ? ' rd-rowdel-wide' : '') + '"' +
            (rowMm ? ' title="Which rows take the extra height">↕' : '>') + '</th></tr></thead><tbody>' + trs + '</tbody></table></div></div>' +
        '<div class="rd-tablebtns">' +
          '<button type="button" data-rd-addrow="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '">+ Row</button>' +
          '<button type="button" data-rd-addcol="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '">+ Column</button>' +
          /* SPC-1: the table as a FORM. A signature block is a table whose cells are
           * mostly empty and need to be big enough to write in, and nothing in a
           * markdown table can say how tall a row is — so it is said here, in the same
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
      return '<p class="muted rd-part-note">' + which + ' <strong>' + esc(String(mm)) +
        'mm</strong> taller than its content, with the content at the top — space to sign or write in. ' +
        'The ticks in the last column choose which.</p>';
    }

    function simplePart(sec, part, i, n, label, note) {
      return '<div class="rd-part rd-part-simple" draggable="true" data-rd-partrow="' + esc(part.id) + '">' +
        '<div class="rd-part-head"><span class="rd-part-kind">' + esc(label) + '</span>' +
          '<span class="muted rd-part-note">' + esc(note) + '</span>' + partControls(sec, part, i, n) + '</div></div>';
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
          '<span class="muted rd-part-note">Empty space down the page. Survives a page break, so a section pushed to the middle of its own page stays there.</span>' +
          partControls(sec, part, i, n) + '</div>' +
        (mm ? '<div class="rd-mmshow" style="height:' + App.docFormat.mmPx(mm) + 'px"></div>' : '') +
        '</div>';
    }

    /**
     * RD-8: the selected section, rendered on its own.
     *
     * Built from `App.docGen.sectionContent` — the same call the host's own generator makes for
     * that block — then through the same markdown renderer as the full preview. So
     * what a section's tab shows and what the section looks like in the finished
     * document come from one code path and cannot drift.
     */
    /**
     * RD-9: a hand-authored section previewed on its own tab, exactly as a generated one
     * already was.
     *
     * It renders through App.doc.renderParts with the SAME ctx the whole document builds
     * with — the real table index, the real reference resolver, the real width and style
     * resolver — so a cross-reference reads its true number here, a captioned table its
     * true one, and a styled table shows its styling. Anything less would be a second
     * renderer, and a second renderer is a second answer.
     */
    function customPreview(project, block) {
      try {
        // Filled, so a reference to a register table resolves here exactly as it will
        // in the document rather than reading "[missing reference]".
        var view = filledView(project);
        var resolved = view.resolved.filter(function (r) { return r.id === block.id; })[0];
        var ctx = docCtx(project, view);
        // `centred` so a part inside a centred section is not wrapped twice — the same
        // ctx App.doc.render builds, so the preview and the document agree.
        var body = App.doc.renderParts(block.parts || [],
          block.centre ? Object.assign({}, ctx, { centred: true }) : ctx);
        if (block.centre && body) body = MD.centred(body);
        var md = MD.join([resolved ? App.doc.headingFor(resolved) : '', body]);
        if (!String(md).trim()) return '<p class="muted">Nothing in this section yet.</p>';
        return '<div class="rd-preview-doc rd-secprev">' + paper(project, App.ui.mdPreview.toHtml(withTags(md)).html) + '</div>';
      } catch (e) {
        return '<p class="rd-err">Preview failed: ' + esc(e && e.message) + '</p>';
      }
    }

    /**
     * REF-1: the outline with every generated section's body FILLED IN.
     *
     * `outlineNow` gives the blocks and their numbers, and that is all a section list
     * needs. A reference does need more: a generated table exists only inside the
     * markdown its register produced, and `App.doc.tableIndex` reads the tables back out
     * of that markdown. Outlining the empty blocks therefore found the hand-authored
     * tables and none of the generated ones — so the link menu offered a document's
     * worth of sections and not one of its register tables.
     *
     * The same call `buildReport` makes, so what the menu offers is exactly what the
     * document will contain. Only built when something asks for it (the link menu, a
     * section preview), because filling every section is the expensive half of
     * generating.
     */
    function filledView(project) {
      var view = outlineNow(project);
      var selId = selectedSubjectId(project);
      if (!selId) return view;
      try {
        var generatedUtc = H().clock.nowIso();
        var ctx = App.docHost.context(selId, generatedUtc);
        var metaRows = App.docHost.chosenMeta(selId, generatedUtc);
        var o = Object.assign({}, opts(), { subjectId: selId });
        o.linkTerms = H().linkTerms ? H().linkTerms(view.blocks) : null;
        o.providers = runSections(selId);
        var filled = view.blocks.map(function (b) {
          return App.docGen.sectionContent(H(), b, o, ctx, metaRows);
        });
        return Object.assign({}, view, { resolved: App.doc.outline(filled, {
          baseLevel: 1,
          clampSkips: view.profile.headings.clampSkips !== false,
          numbered: view.profile.headings.numbered !== false
        }) });
      } catch (e) {
        return view;                       // a broken section must not empty the menu
      }
    }

    /**
     * REF-1: the ctx App.doc renders a document with — the real reference resolver, the
     * real table index, the real control link terms. Built once here so a per-section
     * preview and the whole-document preview cannot answer differently.
     */
    function docCtx(project, view) {
      var tables = App.doc.tableIndex(view.resolved);
      return {
        resolveRef: App.doc.refResolver(view.resolved, tables),
        tables: tables,
        linkTerms: H().linkTerms ? H().linkTerms(view.blocks) : null,
        metrics: App.docFormat.tableMetrics(view.profile),
        styleFor: function (part) {
          return App.docFormat.tableStyle(view.profile, { head: part.styleHead === true, firstColumn: part.styleFirstColumn === true });
        }
      };
    }

    /**
     * GEN-TAB: a preview shows the placeholders as they have been filled in.
     *
     * The whole-document preview gets this for free — it goes through `buildReport`,
     * which substitutes on its way out. The per-section previews do not: they assemble
     * markdown themselves and never reach `emitDocument`, so a section whose heading is
     * "Packages as at /[Date]" previewed with the raw tag while the document it is a
     * preview OF said the date. One line, and the two agree again.
     */
    function withTags(md) { return App.docGen.applyTags(md, opts().tags); }

    /** SEC-1/REF-1: a generated section's introduction, numbered and reference-resolved. */
    function introMd(project, block, resolved) {
      if (!String(block.intro || '').trim()) return '';
      var body = MD.rich(block.intro, docCtx(project, filledView(project)));
      if (!body) return '';
      return (resolved && resolved.introNumber) ? MD.text(resolved.introNumber) + ' ' + body : body;
    }

    function sectionPreview(project, block) {
      if (block && block.kind === 'custom') return customPreview(project, block);
      var selId = selectedSubjectId(project);
      if (!selId) return '<p class="muted">No ' + esc(noun()) + ' selected — nothing to preview.</p>';
      try {
        var generatedUtc = H().clock.nowIso();
        var ctx = App.docHost.context(selId, generatedUtc);
        var filled = App.docGen.sectionContent(H(), block,
          Object.assign({}, opts(), { subjectId: selId, providers: runSections(selId) }), ctx,
          App.docHost.chosenMeta(selId, generatedUtc));
        // Numbered as it will actually be numbered, so the preview reads as the page.
        var resolved = outlineNow(project).resolved.filter(function (r) { return r.id === block.id; })[0];
        var md = App.md.join([
          // The HEADING, not the name (NAM-1): `resolved` already carries the heading as
          // `title`, and forcing the label in here was showing the section list's
          // shorthand in a preview of the page, where the page will print the heading.
          resolved ? App.doc.headingFor(resolved) : '',
          // SEC-1/SEC-2: the introduction, with the number it will actually carry. The
          // number comes from `resolved`, which is the same outline the document uses,
          // so the preview cannot show a different one. REF-1: rendered through the real
          // document ctx, so a cross-reference in an introduction reads here exactly as
          // it will on the page rather than as "[missing reference]".
          introMd(project, block, resolved),
          filled.body || '',
          (filled.children || []).map(function (c) {
            var lvl = Math.min((resolved ? resolved.level : 1) + 1, 4);
            return App.md.join([App.md.heading(lvl, App.md.text(c.label)), c.body]);
          }).join('\n\n')
        ]);
        if (!String(md).trim()) return '<p class="muted">This section is empty for the selected ' + esc(noun()) + '.</p>';
        return '<div class="rd-preview-doc rd-secprev">' + paper(project, App.ui.mdPreview.toHtml(withTags(md)).html) + '</div>';
      } catch (e) {
        return '<p class="rd-err">Preview failed: ' + esc(e && e.message) + '</p>';
      }
    }

    /** META-1: the include/exclude ticks for the subject's metadata rows. */
    function metaPane(project) {
      var selId = selectedSubjectId(project);
      if (!selId) return '<p class="muted">No ' + esc(noun()) + ' selected.</p>';
      var chosen = (bag(project).meta) || {};
      // Every row the host CAN state, ticked or not — this is the picker, so a row
      // switched off still has to appear in it.
      var rows = H().subject.meta(selId);
      return '<div class="rd-fieldset"><strong>Rows</strong>' +
        '<p class="muted">Which lines of provenance this block carries. Saved with the project, so it travels in a report template.</p>' +
        rows.map(function (r) {
          var v = String(r.value);
          return '<label class="gen-opt rd-metarow"><input type="checkbox" data-rd-meta="' + esc(r.id) + '"' +
            (chosen[r.id] === false ? '' : ' checked') + ' aria-label="Include ' + esc(r.label) + '"> ' +
            esc(r.label) + '<span class="rd-metaval">' + esc(v.slice(0, 28) + (v.length > 28 ? '…' : '')) + '</span></label>';
        }).join('') + '</div>';
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
      var byLevel = App.docFormat.levelBreaks(App.docFormat.resolve(project))[lvl] === true;
      return '<div class="rd-fieldset"><strong>On the page</strong>' +
        cb('data-rd-centre="' + esc(block.id) + '"',
          'Centre this section\u2019s content \u2014 heading included', block.centre === true) +
        cb('data-rd-pagebreak="' + esc(block.id) + '"',
          'Start this section on a new page', byLevel || block.pageBreakBefore === true, byLevel) +
        (byLevel
          ? '<p class="muted rd-hint">Already on: <strong>' + esc(App.doc.levelLabel(lvl)) +
            '</strong> starts a new page under <strong>Formatting \u2192 Fonts</strong>, for every section at that level. ' +
            'Change it there, or give this section a different level.</p>'
          : '') +
        cb('data-rd-notoc="' + esc(block.id) + '"',
          'Leave this section out of the contents list', block.noToc === true) +
        '<p class="muted rd-hint">A section left out of the contents still prints its heading and keeps its number, ' +
        'so a cross-reference to it still reads correctly \u2014 it is simply not listed.</p>' +
        /* SPC-1: space ABOVE the heading, which is the one gap no part can make \u2014 every
         * part a section has is already below it. With the page break above, this is how
         * a signature page is composed: its own page, and its heading two thirds down. */
        '<label class="rd-mmlab rd-secspace">Start this section <input class="rd-mm" type="number" min="0" max="' +
          App.docStore.MAX_SPACE_MM + '" step="5" value="' + esc(String(App.docStore.mmValue(block.spaceBefore) || '')) +
          '" data-rd-space-block="' + esc(block.id) + '" placeholder="0" aria-label="Millimetres of space above this section"> mm ' +
          'further down the page</label>' +
        '<p class="muted rd-hint">Empty space above the heading, which the page break above composes with: a new page, ' +
        'then this far down it. It survives being at the top of a page, so the gap is there whether or not the section ' +
        'happened to break.</p>' +
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
            '<input class="rd-title" value="' + esc(e.title || '') + '" ' + attrs + ' data-rd-tbl-field="title"' +
              ' placeholder="Optional \u2014 a row above the column headings" aria-label="Title row"></label>' +
          // CAP-4: the caption box is hidden rather than disabled when there is to be no
          // caption — a box you may type into that will not be printed is a trap.
          (e.noCaption === true
            ? '<p class="muted rd-hint">Uncaptioned, so this table takes no number and cannot be cross-referenced.</p>'
            : '<label class="rd-lab">Caption' +
              '<input class="rd-title" value="' + esc(e.caption || '') + '" ' + attrs + ' data-rd-tbl-field="caption"' +
                ' placeholder="' + esc(String(e.title || '').trim() || block.title || block.label) + '" aria-label="Caption"></label>') +
          cb(attrs + ' data-rd-tbl-nocap', 'No caption', e.noCaption === true) +
          '<div class="rd-grid">' + cols.all.map(function (c) {
            return '<label class="rd-lab rd-lab-s">' + esc(c.label) +
              '<input value="' + esc(custom[c.id] || '') + '" ' + attrs + ' data-rd-tbl-col="' + esc(c.id) + '"' +
                ' placeholder="' + esc(c.label) + '" aria-label="Heading for the ' + esc(c.label) + ' column"></label>';
          }).join('') + '</div></div>';
      }).join('');
      return '<div class="rd-fieldset"><strong>Table wording</strong>' +
        '<p class="muted">What each of this section\u2019s tables calls itself and its columns. Blank means the standard wording. ' +
        'The caption follows the title row unless you give it one of its own.</p>' +
        body + '</div>';
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
            '<input class="rd-title" value="' + esc(heading === dflt ? '' : heading) + '" data-rd-sec-heading="' + esc(block.id) + '"' +
              ' placeholder="' + esc(dflt) + '" aria-label="Heading for ' + esc(block.label) + '"></label>' +
          '<p class="muted rd-hint">What the document prints. Leave it blank for the standard wording, <strong>' + esc(dflt) + '</strong>.</p>') +
        '<label class="rd-lab">Name in this list' +
        '<input class="rd-title" value="' + esc(block.name || '') + '" data-rd-sec-name="' + esc(block.id) + '"' +
          ' placeholder="' + esc(heading || 'Same as the heading') + '" aria-label="Name for ' + esc(block.label) + '"></label>' +
        '<p class="muted rd-hint">Shorthand for the section list only \u2014 the document still prints the heading. Leave it blank and the name <em>is</em> the heading.</p>';
    }

    /** SEC-1: prose between this section's heading and its generated table. */
    function introField(project, block) {
      /* REF-1: the same toolbar a hand-authored paragraph has.
       *
       * An introduction is a paragraph in the same token markup, rendered by the same
       * App.md.rich \u2014 the only thing it was missing was the two buttons, and (until
       * REF-1) a reference resolver at render time, so a link inserted here would not
       * have resolved anyway. Both are fixed together; one without the other is a button
       * that produces "[missing reference]". */
      var refOpen = _rd.refFor === 'intro:' + block.id;
      return '<div class="rd-fieldset"><strong>Introduction</strong>' +
        '<p class="muted">Your own words, printed between the heading and the table. Written once for the section, so a register split into groups is introduced once rather than once per group.</p>' +
        '<div class="rd-part-head"><span class="rd-tbs">' + toolbar('data-rd-block="' + esc(block.id) + '"') +
          '<button type="button" class="rd-tb" data-rd-ref-open="' + esc('intro:' + block.id) + '"' +
            ' title="Insert a cross-reference that survives renaming and reordering">\ud83d\udd17 Link</button>' +
        '</span></div>' +
        (refOpen ? refMenuFor(project, block.id, 'data-rd-ref-block="' + esc(block.id) + '"') : '') +
        richBox(project, 'data-rd-intro="' + esc(block.id) + '"' +
          ' aria-label="Introduction for ' + esc(block.label) + '"', block.intro, '',
          'Optional. A blank line starts a new paragraph.') +
        hostileHint(block.intro || '') +
        cb('data-rd-intro-num="' + esc(block.id) + '"', 'Number it', block.introNumbered === true) +
        '<p class="muted rd-hint">A numbered introduction takes the first of this section\u2019s numbers \u2014 <em>5 Packages</em>, then <em>5.1</em> the introduction, then <em>5.2 Packages \u2014 Removed</em>. Unnumbered, it is simply the prose under the heading.</p>' +
        '</div>';
    }

    /** TBS-1: whether this section's generated tables wear the profile's table styling. */
    function tableStyleField(project, block) {
      var t = App.docFormat.normalise(App.docFormat.resolve(project)).tables;
      function describe(s) {
        var bits = [];
        if (s.bold) bits.push('bold');
        if (s.italic) bits.push('italic');
        if (s.shade) bits.push('shaded ' + s.shade);
        return bits.length ? bits.join(', ') : 'no styling set';
      }
      var st = block.tableStyle || {};
      return '<div class="rd-fieldset"><strong>Table styling</strong>' +
        '<p class="muted">What <em>styled</em> looks like is set once, in the <strong>Formatting</strong> pane; which tables wear it is decided here, per section.</p>' +
        // FNT-4: opting in is about the SHADE now; the weight reaches every table.
        cb('data-rd-tstyle="head" data-rd-block="' + esc(block.id) + '"', 'Shade the header row (' + describe(t.head) + ')', st.head === true) +
        cb('data-rd-tstyle="firstColumn" data-rd-block="' + esc(block.id) + '"', 'Style the first column (' + describe(t.firstColumn) + ')', st.firstColumn === true) +
        '</div>';
    }

    function paneSection(project, view) {
      var id = _rd.selected;
      if (!id) return '<p class="muted">Pick a section on the left to open it.</p>';
      var block = view.blocks.filter(function (b) { return b.id === id; })[0];
      if (!block) return '<p class="muted">That section is no longer in the document.</p>';

      // --- a generated section: its groups, its columns, and a preview of it
      if (block.kind !== 'custom') {
        var out = ['<h5>' + esc(block.label) + '</h5>'];
        if (block.kind === 'meta') out.push('<p class="muted">The details the host gives about this ' + esc(noun()) + ', one row each. Untick a row below to leave it out.</p>');
        out.push(nameField(block, block.defaultTitle));
        out.push(centreToggle(project, block, view.resolved.filter(function (r) { return r.id === block.id; })[0]));
        out.push(introField(project, block));
        out.push(tableWordingEditor(project, block));
        out.push(tableStyleField(project, block));
        if (block.kind === 'meta') out.push(metaPane(project));
        // OPT-1: the column and group ticks are on the section ROW now, not here — see
        // optionsMenu. What stays is the width strip, which is drawn against whatever
        // those ticks have left switched on.
        var cols = App.docGen.sectionColumns(H(), block, opts());
        if (cols && cols.all.length) out.push(widthStrip(project, block.id, cols.all, block.widths));
        out.push('<p class="muted rd-hint">This section\'s content is generated from the register. Its <strong>columns</strong>' +
          (block.groups ? ' and <strong>groups</strong>' : '') + ' are on the &#9776; button beside it in the list, so they can be changed without leaving whatever pane you are on. ' +
          'Add a <strong>custom section</strong> if you need prose or a table of your own.</p>');
        out.push('<div class="rd-fieldset rd-secprev-wrap"><strong>Preview</strong>' +
          '<p class="muted">This section as it will appear, for the selected ' + esc(noun()) + '.</p>' +
          sectionPreview(project, block) + '</div>');
        return out.join('');
      }

      // --- a hand-authored section
      var sec = customSection(project, id);
      if (!sec) return '<p class="muted">That section is no longer in the document.</p>';
      var parts = sec.parts || [];
      var body = parts.map(function (p, i) {
        if (p.kind === 'para') return paraEditor(project, sec, p, i, parts.length);
        if (p.kind === 'table') return tableEditor(project, sec, p, i, parts.length);
        if (p.kind === 'rule') return simplePart(sec, p, i, parts.length, 'Horizontal line', 'A rule across the page.');
        if (p.kind === 'space') return spaceEditor(sec, p, i, parts.length);
        return simplePart(sec, p, i, parts.length, 'Page break', 'Forces what follows onto a new page.');
      }).join('');

      return '<div class="rd-sec-edit">' +
        centreToggle(project, block, view.resolved.filter(function (r) { return r.id === block.id; })[0]) +
        '<label class="rd-lab">Heading<input class="rd-title" value="' + esc(sec.title || '') + '" data-rd-sec-title="' + esc(sec.id) + '" placeholder="Leave blank for a paragraph with no heading" aria-label="Section heading"></label>' +
        '<p class="muted rd-hint">With no heading this becomes body text and keeps the level of the section above it — unless you pin a level on the left.</p>' +
        nameField(block) +
        '<div class="rd-parts">' + (body || '<p class="muted">Nothing in this section yet.</p>') + '</div>' +
        '<div class="rd-addbar">' +
          '<button type="button" data-rd-addpart="para" data-rd-sec="' + esc(sec.id) + '">+ Paragraph</button>' +
          '<button type="button" data-rd-addpart="table" data-rd-sec="' + esc(sec.id) + '">+ Table</button>' +
          '<button type="button" data-rd-addpart="rule" data-rd-sec="' + esc(sec.id) + '">+ Line</button>' +
          '<button type="button" data-rd-addpart="space" data-rd-sec="' + esc(sec.id) + '" title="A measured gap down the page">+ Space</button>' +
          '<button type="button" data-rd-addpart="pagebreak" data-rd-sec="' + esc(sec.id) + '">+ Page break</button>' +
          '<span class="spacer"></span>' +
          '<button type="button" data-rd-save-template="' + esc(sec.id) + '" title="Save this section\'s shape for reuse in any project">Save as template&hellip;</button>' +
          '<button type="button" class="danger" data-rd-del-section="' + esc(sec.id) + '">Delete section</button>' +
        '</div>' +
        '<div class="rd-fieldset rd-secprev-wrap"><strong>Preview</strong>' +
          '<p class="muted">This section as it will appear, numbered as it will be numbered.</p>' +
          sectionPreview(project, block) + '</div>' +
        '</div>';
    }

    // ======================================================================
    // RD-3: relevance (RPT-2, carried over unchanged)
    // ======================================================================

    function omittedByRelevance(project, selId) {
      var counts = categoryCounts(selId);
      var map = opts().relevance || {};
      var n = 0;
      Object.keys(counts).forEach(function (k) { if (map[k] === false) n += counts[k]; });
      return n;
    }

    function paneRelevance(project) {
      var selId = selectedSubjectId(project);
      var counts = categoryCounts(selId);
      var map = opts().relevance || {};
      var rows = ((H().filter && H().filter.categories()) || []).map(function (c) {
        var k = c.key, on = map[k] !== false, num = counts[k] || 0, label = c.label;
        // The category's own name, styled by the host's stylesheet if it wants to.
        // It used to borrow CH's register badge, which is a component of the app's
        // data tables and has no business being reachable from in here.
        var chip = '<span class="rd-cat rd-cat-' + esc(String(k).toLowerCase()) + '">' + esc(label) + '</span>';
        return '<label class="rpt-rel"><input type="checkbox" data-rd-rel="' + esc(k) + '"' + (on ? ' checked' : '') +
          ' aria-label="Include ' + esc(label) + ' items"> ' + chip + '<span class="rpt-rel-count">' + num + ' item' + (num === 1 ? '' : 's') + '</span></label>';
      }).join('');
      var omitted = omittedByRelevance(project, selId);
      return '<p class="muted rpt-note">Which categories of item the document carries. Anything switched off is counted and named in it, so a shorter report never passes for a complete one.</p>' +
        rows +
        (omitted
          ? '<p class="rpt-omit"><strong>' + omitted + '</strong> item' + (omitted === 1 ? '' : 's') + ' will be left out.</p>'
          : '<p class="rpt-omit muted">Every applicable item is being carried.</p>') +
        '<div class="rd-fieldset"><strong>Document</strong>' +
          // HDR-1: the OFFICIAL: Sensitive banner has moved to the Header & Footer pane,
          // which is where it goes on the page and where everything else that appears on
          // every page is now decided.
          // TTL-2: a project decision, so it is stored rather than reset each session —
          // hence its own attribute rather than another session flag.
          cb('data-rd-titleblock', 'Automatic title block (title, model and date)',
            ((project.report || {}).titleBlock === true)) +
          '<p class="muted rd-hint">Off, the document starts with whatever section you put first — compose your own title page as a section and give it the <strong>T</strong> level.</p>' +
        '</div>';
    }

    // ======================================================================
    // RD-4: formatting profiles (FMT-1..FMT-4)
    // ======================================================================

    function num(label, key, val, hint) {
      return '<label class="rd-lab rd-lab-s" title="' + esc(hint || '') + '">' + esc(label) +
        '<input value="' + esc(val == null ? '' : val) + '" data-rd-fmt="' + esc(key) + '" aria-label="' + esc(label) + '"></label>';
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

    function paneFormatting(project) {
      var all = App.docFormat.list(project);
      var active = App.docFormat.resolve(project);
      var editId = _rd.fmtId || active.id;
      var f = all.filter(function (x) { return x.id === editId; })[0] || active;
      var builtin = !!f.builtin;

      var head = '<div class="rd-fmt-head">' +
        '<label class="rd-lab">Profile in use' +
          '<select data-rd-fmt-active aria-label="Formatting profile in use">' +
            all.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === active.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') +
          '</select></label>' +
        '<label class="rd-lab">Editing' +
          '<select data-rd-fmt-edit aria-label="Formatting profile being edited">' +
            all.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === f.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') +
          '</select></label>' +
        '<span class="spacer"></span>' +
        '<button type="button" data-rd-fmt-new>Duplicate</button>' +
        '<button type="button" class="danger" data-rd-fmt-del' + (builtin ? ' disabled' : '') + '>Delete</button>' +
        '</div>';

      var locked = builtin
        ? '<div class="rd-locked">The <strong>Standard</strong> profile ships with the tool and cannot be edited — <strong>Duplicate</strong> it and change the copy. That keeps a known-good baseline in every project.</div>'
        : '';

      var page = '<div class="rd-fieldset"><strong>Page</strong>' +
        '<div class="rd-grid">' +
          pick('Paper', 'page.paper', f.page.paper, App.docFormat.PAPERS) +
          // FNT-3: the document's own size has moved to the Fonts table below, beside the
          // heading sizes and the two table sizes — every size in the document, in one
          // place, rather than one under Page, two under Tables and four under Headings.
          pick('Body font', 'page.fontFamily', f.page.fontFamily, App.docFormat.FONTS,
            'Every font here ships with the TeX distribution, so the .md carries its own font and needs nothing installed on the machine that builds the PDF.') +
          num('Line spacing', 'page.lineSpacing', f.page.lineSpacing, '1 = single, 1.15, 1.5 …') +
          num('Margin top', 'page.marginTop', f.page.marginTop, 'A bare number is read as millimetres.') +
          num('Margin bottom', 'page.marginBottom', f.page.marginBottom, 'A bare number is read as millimetres.') +
          num('Margin left', 'page.marginLeft', f.page.marginLeft, 'A bare number is read as millimetres.') +
          num('Margin right', 'page.marginRight', f.page.marginRight, 'A bare number is read as millimetres.') +
          // HDR-1: the page-number picker is gone. It offered five fixed positions for
          // one thing, and the Header & Footer pane offers six slots you can put
          // anything in — the number included. Two mechanisms aiming at the same three
          // positions is how a document ends up printing the number twice.
        '</div>' +
        // CODE-1: a shade well plus its "no shade" button, the same pair the table
        // styling uses — a colour picker has no "none", and white is a colour.
        '<div class="rd-grid rd-grid-inline">' +
          '<label class="rd-lab rd-lab-s" title="The background behind a package name, a key or a hash. A run too long to fit stays unshaded so it can still wrap.">Code shading' +
            '<input type="color" class="rd-shade" value="' + esc(f.page.codeShade || '#ffffff') + '" data-rd-fmt="page.codeShade" aria-label="Code span shading"></label>' +
          '<button type="button" data-rd-fmt-clear="page.codeShade" title="No background behind code spans">No shade</button>' +
        '</div></div>';

      /* FNT-3: every size in the document, in one table.
       *
       * The four heading levels were here; the document's own size was under Page and the
       * two table sizes under Tables, which meant "what size is this set at?" was three
       * questions in three places. They are one question, so they are one table — and the
       * three that are not headings simply have fewer answers: a run of body text has a
       * size and nothing else. What has no meaning for a row is DISABLED rather than
       * absent, so the column still lines up and the row says plainly that the setting
       * belongs to headings.
       */
      function txtCell(key, v, label, on) {
        return '<td><input class="rd-tiny" value="' + esc(v == null ? '' : v) + '"' +
          (on === false ? ' disabled' : ' data-rd-fmt="' + esc(key) + '"') +
          ' aria-label="' + esc(label) + '"></td>';
      }
      function boolCell(key, checked, label, on) {
        return '<td><input type="checkbox"' + (checked ? ' checked' : '') +
          (on === false ? ' disabled' : ' data-rd-fmt-bool="' + esc(key) + '"') +
          ' aria-label="' + esc(label) + '"></td>';
      }
      /**
       * FNT-4: a row for something that has a size, a weight and a slope — but none of
       * the placement a heading has.
       *
       * Bold and italic used to be greyed out here, which said "body text cannot be
       * bold" — untrue of every one of these four, and the reason a report whose house
       * style sets tables in italic could not be produced. What genuinely has no meaning
       * for them is leading, the two spacings and the page break, and those stay
       * disabled so the row still says plainly which settings belong to headings.
       */
      /* `sizeKey` may be null, for a kind of text with a weight and a slope but no size
       * of its own. FNT-5 made the table's first column one such row, because its
       * emphasis travels as markdown on the cell and markdown cannot say "and set this
       * column two points smaller". FNT-6 gave it one anyway — through a LaTeX macro,
       * which is the same route the shading has always taken — so nothing uses the null
       * form today. It stays because the next kind of text may want it. */
      function textRow(label, sizeKey, size, boldKey, bold, italicKey, italic) {
        return '<tr><th>' + esc(label) + '</th>' +
          (sizeKey ? txtCell(sizeKey, size, label + ' size') : txtCell('', '', label + ' size', false)) +
          txtCell('', '', label + ' leading', false) +
          boolCell(boldKey, bold, label + ' bold') + boolCell(italicKey, italic, label + ' italic') +
          txtCell('', '', label + ' space before', false) + txtCell('', '', label + ' space after', false) +
          boolCell('', false, label + ' new page', false) + '</tr>';
      }
      var fonts = '<div class="rd-fieldset"><strong>Fonts</strong>' +
        flag('Number the sections', 'headings.numbered', f.headings.numbered !== false, 'Numbers are written into the markdown, so the preview, the .md and the PDF all agree.') +
        flag('Pull up a skipped level', 'headings.clampSkips', f.headings.clampSkips !== false, 'An H3 with no H2 above it becomes an H2. Switch off to let it number as 1.0.1, which is what LaTeX would do.') +
        '<table class="rd-lvl"><thead><tr><th>Text</th><th>Size</th><th>Leading</th><th>Bold</th><th>Italic</th><th>Space before</th><th>Space after</th><th>New page</th></tr></thead><tbody>' +
        f.levels.map(function (lv, i) {
          // TTL-3: the title is a level like any other in this table, and the first one —
          // it prints above every heading, so it is listed above them.
          var name = lv.level === App.doc.TITLE_LEVEL ? 'Title' : 'H' + lv.level;
          function cell(k, v) {
            return txtCell('levels.' + i + '.' + k, v, name + ' ' + k);
          }
          function bcell(k, on) {
            return boolCell('levels.' + i + '.' + k, on, name + ' ' + k);
          }
          return '<tr><th>' + esc(name) + '</th>' + cell('size', lv.size) + cell('leading', lv.leading) +
            bcell('bold', lv.bold) + bcell('italic', lv.italic) +
            cell('spaceBefore', lv.spaceBefore) + cell('spaceAfter', lv.spaceAfter) +
            bcell('pageBreakBefore', lv.pageBreakBefore) + '</tr>';
        }).join('') +
        textRow('Regular', 'page.fontSize', f.page.fontSize, 'page.bold', f.page.bold, 'page.italic', f.page.italic) +
        textRow('Table text', 'tables.fontSize', f.tables.fontSize, 'tables.bold', f.tables.bold, 'tables.italic', f.tables.italic) +
        textRow('Table headers', 'tables.headFontSize', f.tables.headFontSize, 'tables.headBold', f.tables.headBold, 'tables.headItalic', f.tables.headItalic) +
        // FNT-5: the first column of every table, beside the header row it matches.
        // FNT-6: with a size of its own, like every other row in this table.
        textRow('Table first column', 'tables.firstColFontSize', f.tables.firstColFontSize,
          'tables.firstColBold', f.tables.firstColBold, 'tables.firstColItalic', f.tables.firstColItalic) +
        textRow('Table captions', 'tables.captionFontSize', f.tables.captionFontSize, 'tables.captionBold', f.tables.captionBold, 'tables.captionItalic', f.tables.captionItalic) +
        '</tbody></table>' +
        '<p class="muted rd-hint"><strong>Title</strong> is the <code>T</code> level — a heading that prints at the top level and takes no number. ' +
        '<strong>Regular</strong> is the document’s own size, which everything else falls back to: leave the three table sizes blank and a table is set at it. ' +
        '<strong>Table headers</strong> and <strong>Table first column</strong> apply to every table, whether or not the section has opted that part in for shading — including their <strong>size</strong>, so a key column can be set smaller than the prose beside it. ' +
        'The greyed cells are heading-only — a run of body text has a size and a weight, not a space-before.</p></div>';

      var toc = '<div class="rd-fieldset"><strong>Contents</strong>' +
        flag('Include a table of contents', 'toc.include', !!(f.toc && f.toc.include)) +
        '<div class="rd-grid">' +
          num('Depth', 'toc.depth', f.toc.depth, 'How many heading levels the contents lists.') +
          num('Space between entries', 'toc.entrySpacing', f.toc.entrySpacing,
            'Points between one line of the contents and the next. Nested entries take half. LaTeX’s own is about 10pt, which on a report of one-line sections reads as a half-empty page.') +
        '</div>' +
        '<p class="muted rd-hint">Where the list goes is the <strong>Contents</strong> section’s business, in the list on the left — move it, rename it or give it a heading level like any other section.</p></div>';

      // TBS-1: the LOOK of a styled header row / first column. Which tables wear it is
      // decided per table — on a generated section in the Section pane, on a
      // hand-authored one on the table itself — so nothing here switches anything on.
      /* FNT-4/FNT-5: neither row has a bold/italic cell here any more.
       *
       * Both had one, and so did the Fonts table, and the two meant different things —
       * this one only reached the sections that had ticked the part in, that one reached
       * every table. Two switches saying "bold" is how a document ends up with two kinds
       * of header. The weights live with the other type settings now.
       *
       * They were left here as a greyed "set in Fonts, above" note, which is two dead
       * columns explaining themselves in every profile anybody opens. The sentence under
       * the table says the same thing once, so the columns are gone: what this table is
       * for is the SHADE, and it now says only that.
       */
      function styleRow(label, key, s) {
        return '<tr><th>' + esc(label) + '</th>' +
          '<td><input type="color" class="rd-shade" value="' + esc(s.shade || '#ffffff') + '" data-rd-fmt="tables.' + key + '.shade" aria-label="' + esc(label) + ' shade colour"></td>' +
          '<td><button type="button" data-rd-fmt-clear="tables.' + key + '.shade" title="Remove the shading">No shade</button></td></tr>';
      }
      var tables = '<div class="rd-fieldset"><strong>Tables</strong>' +
        // FNT-3: the two table SIZES are in the Fonts table above, with every other size
        // in the document. What is left here is what is particular to a table.
        '<div class="rd-grid">' +
          pick('Caption position', 'tables.captionPosition', f.tables.captionPosition, CAPTION_POSITIONS,
            'Which side of the table the caption sits on. It is numbered either way — “Table 4: …” — with the same number a cross-reference to it uses.') +
          num('Caption gap', 'tables.captionSkip', f.tables.captionSkip, 'Points between the table and its caption.') +
        '</div>' +
        flag('Centre the table caption', 'tables.captionCentre', !!(f.tables && f.tables.captionCentre),
          'Otherwise it starts at the left edge of the text, like a paragraph.') +
        '<p class="muted">What a section buys by opting its header row or first column in: the <strong>shading</strong>, which reaches the PDF as a LaTeX table colour and needs no filter and no extra tool. Their size, weight and slope are in <strong>Fonts</strong>, above, and reach every table.</p>' +
        '<table class="rd-lvl"><thead><tr><th>Part</th><th>Shade</th><th></th></tr></thead><tbody>' +
        styleRow('Header row', 'head', f.tables.head) +
        // FNT-5/FNT-6: the first column's size, weight and slope are in the Fonts table,
        // for the reason the header row's are — they reach every table, and a second
        // "bold" here meant a document could end up with two kinds of first column.
        styleRow('First column', 'firstColumn', f.tables.firstColumn) +
        '</tbody></table></div>';

      // Sharing profiles between projects is a CATALOGUE job, so it lives in the
      // Templates pane beside the other two — one place to look for import/export,
      // rather than three scattered through the workspace.
      var io = '<p class="muted rd-hint">Profiles travel with the project file. To share one between projects, ' +
        'export it from the <strong>Templates</strong> pane.</p>';

      return head + locked + '<fieldset class="rd-fmt-body"' + (builtin ? ' disabled' : '') + '>' + page + fonts + toc + tables + '</fieldset>' + io;
    }

    // ======================================================================
    // HDR-1: the header and footer
    // ======================================================================

    /**
     * Six slots, and a second six for the first page when it is asked to be different.
     *
     * Drawn as a three-column strip rather than a list of labelled boxes, because what
     * an operator is deciding is a POSITION — "the classification goes in the middle" —
     * and a row of three boxes in the order they will print says that without a word.
     */
    function hfRow(project, f, set, label, hint) {
      var hfv = f.headerFooter[set];
      return '<div class="rd-hf"><div class="rd-hf-h">' + esc(label) +
        (hint ? '<span class="muted"> — ' + esc(hint) + '</span>' : '') + '</div>' +
        '<div class="rd-hf-slots">' + App.docFormat.HF_SLOTS.map(function (s) {
          return '<label class="rd-lab rd-lab-s">' + esc(s === 'centre' ? 'Centre' : s === 'left' ? 'Left' : 'Right') +
            '<input value="' + esc(hfv[s] || '') + '" data-rd-hf-set="' + esc(set) + '" data-rd-hf-slot="' + s + '"' +
              ' aria-label="' + esc(label + ', ' + s) + '"></label>';
        }).join('') + '</div></div>';
    }

    function paneHeaderFooter(project) {
      var all = App.docFormat.list(project);
      var active = App.docFormat.resolve(project);
      var editId = _rd.fmtId || active.id;
      var f = all.filter(function (x) { return x.id === editId; })[0] || active;
      var builtin = !!f.builtin;
      var first = f.headerFooter.firstDifferent;

      var head = '<div class="rd-fmt-head">' +
        '<label class="rd-lab">Editing' +
          '<select data-rd-fmt-edit aria-label="Formatting profile being edited">' +
            all.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === f.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') +
          '</select></label>' +
        '<span class="spacer"></span>' +
        '<button type="button" data-rd-fmt-new>Duplicate</button>' +
        '</div>' +
        (builtin
          ? '<div class="rd-locked">The <strong>Standard</strong> profile ships with the tool and cannot be edited — <strong>Duplicate</strong> it and change the copy.</div>'
          : '');

      var marking = (project.report || {}).classification;
      var markings = H().classifications || [];
      var banner = '<div class="rd-fieldset"><strong>Classification banner</strong>' +
        // CLS-1: read from the project, like the title block, not from the session. CLS-2: the
        // choices are the host's; there is no free text, so a marking cannot be mistyped.
        '<label class="rd-lab">Marking on every page <select data-rd-classification aria-label="Classification marking">' +
          '<option value=""' + (marking ? '' : ' selected') + '>None</option>' +
          markings.map(function (m) {
            return '<option value="' + esc(m) + '"' + (m === marking ? ' selected' : '') + '>' + esc(m) + '</option>';
          }).join('') +
        '</select></label>' +
        '<p class="muted rd-hint">Printed in the first free slot of the header and of the footer, preferring the centre. ' +
        'Fill all three slots of a line yourself and the banner leaves that line alone — your words win.</p>' +
        '<p class="muted rd-hint">Saved with the project, so it is set once for the document rather than re-ticked ' +
        'every time the tool is opened.</p></div>';

      var body = '<fieldset class="rd-fmt-body"' + (builtin ? ' disabled' : '') + '>' +
        '<div class="rd-fieldset"><strong>Every page</strong>' +
          '<p class="muted">What each line reads. Write <code>#page</code> for the page number and <code>#pages</code> for the total — ' +
          'so <code>Page #page of #pages</code> prints “Page 3 of 12”. Everything else is printed as you write it, ' +
          'so a header reading “Title page” stays “Title page”.</p>' +
          hfRow(project, f, 'header', 'Header') +
          hfRow(project, f, 'footer', 'Footer') +
        '</div>' +
        '<div class="rd-fieldset"><strong>The first page</strong>' +
          cb('data-rd-hf-first', 'Give the first page its own header and footer', first) +
          '<p class="muted rd-hint">A title page usually wants neither. Leave every slot empty and the first page carries nothing.</p>' +
          (first
            ? hfRow(project, f, 'firstHeader', 'First-page header') + hfRow(project, f, 'firstFooter', 'First-page footer')
            : '') +
        '</div>' +
        '</fieldset>';

      return head + banner + body +
        '<p class="muted rd-hint">These show in the <strong>Preview</strong> only with <strong>Pages</strong> switched on — ' +
        'a continuous scroll has no page edges to put them against.</p>';
    }

    // ======================================================================
    // RD-5: templates (TPL-1..TPL-4)
    // ======================================================================

    function templateList(items, kind, emptyNote) {
      if (!items.length) return '<p class="muted">' + esc(emptyNote) + '</p>';
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
      return '<div class="rd-fieldset"><strong>Formatting profiles</strong>' +
          '<p class="muted">Page setup and heading styling, saved under a name. Edit them in the <strong>Formatting</strong> pane; export them here to reuse in another project.</p>' +
          (profiles.length
            ? '<ul class="rd-tpl-list">' + profiles.map(function (f) {
                return '<li><span class="rd-tpl-name">' + esc(f.name) + '</span></li>';
              }).join('') + '</ul>'
            : '<p class="muted">Only the built-in Standard profile so far. Duplicate it in the Formatting pane to make your own.</p>') +
          '<div class="rd-addbar">' +
            '<button type="button" data-rd-export="formats"' + (profiles.length ? '' : ' disabled') + '>Export</button>' +
            '<label class="rd-filebtn">Import<input type="file" accept=".json,application/json" data-rd-import="formats"></label>' +
          '</div></div>' +
        '<div class="rd-fieldset"><strong>Section templates</strong>' +
          '<p class="muted">A saved section — its heading and every paragraph, table and rule in it. Use one to drop a ready-made section into this document. Save one from the <strong>Section</strong> pane.</p>' +
          templateList(b.sectionTemplates || [], 'sections', 'No section templates yet.') +
          '<div class="rd-addbar">' +
            '<button type="button" data-rd-export="sections"' + ((b.sectionTemplates || []).length ? '' : ' disabled') + '>Export</button>' +
            '<label class="rd-filebtn">Import<input type="file" accept=".json,application/json" data-rd-import="sections"></label>' +
          '</div></div>' +
        '<div class="rd-fieldset"><strong>Report templates</strong>' +
          '<p class="muted">The whole design: the section order, the pinned levels, every custom section and the formatting profile. Applying one <strong>replaces</strong> the current arrangement.</p>' +
          templateList(b.reportTemplates || [], 'reports', 'No report templates yet.') +
          '<div class="rd-addbar">' +
            '<button type="button" class="primary" data-rd-rpt-save>Save current design&hellip;</button>' +
            '<button type="button" data-rd-export="reports"' + ((b.reportTemplates || []).length ? '' : ' disabled') + '>Export</button>' +
            '<label class="rd-filebtn">Import<input type="file" accept=".json,application/json" data-rd-import="reports"></label>' +
          '</div></div>' +
        '<p class="muted rd-hint">An import never deletes what you already have. If a name collides you are asked, one by one, which to keep.</p>';
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
     * Two things happen here that cannot happen anywhere else. The document is NAMED —
     * a report an operator will file alongside forty others should not have to be called
     * `dev-m1-reporting-20260630T120000Z.md` — and every `/[Tag]` written anywhere in it
     * is listed with a box beside it, so the same design can be issued repeatedly with a
     * new date, a new author, a new reference number.
     *
     * The tag list is read off the FINISHED document, which is why this pane builds one
     * to draw itself. That is the only way the list can be complete: a tag in a footer
     * slot, in a column heading and in a paragraph all arrive in the same string in the
     * end, and nothing short of the end sees all three.
     */
    function paneGenerate(project, view) {
      var selId = selectedSubjectId(project);
      if (!selId) return '<p class="muted">No ' + esc(noun()) + ' selected — nothing to generate.</p>';
      var ready = H().subject.ready(selId);
      var o = opts();
      var built = null;
      try { built = H().build ? H().build(selId, Object.assign({}, o, { tags: {} })) : null; } catch (e) { built = null; }
      var tags = built ? App.docGen.findTags(built.text || '') : [];
      var values = o.tags || {};
      var unfilled = tags.filter(function (t) { return !String(values[t] || '').trim(); });

      var name = App.docGen.docFilename(o.filename);
      var tagRows = tags.length
        ? tags.map(function (t) {
            var v = String(values[t] || '');
            return '<label class="rd-lab rd-tagrow"><code>/[' + esc(t) + ']</code>' +
              '<input value="' + esc(v) + '" data-rd-tag="' + esc(t) + '"' +
                ' placeholder="What should this read?" aria-label="Value for the ' + esc(t) + ' tag"></label>';
          }).join('')
        : '<p class="muted">None written yet. Type <code>/[Date]</code> — a slash, then a name in square brackets — ' +
          'in any heading, paragraph, table or header slot and it will be listed here.</p>';

      return '<div class="rd-fieldset"><strong>File name</strong>' +
          '<p class="muted">What the generated <code>.md</code> is called (the <code>.html</code> takes the same name). Leave it blank for the standard ' +
          'name the host gives it.</p>' +
          '<label class="rd-lab"><input class="rd-title" value="' + esc(o.filename || '') + '" data-rd-filename' +
            ' placeholder="' + esc(selId + '-reporting-…….md') + '" aria-label="File name"></label>' +
          (name ? '<p class="muted rd-hint">Saves as <code>' + esc(name) + '</code>.</p>' : '') +
        '</div>' +
        '<div class="rd-fieldset"><strong>Placeholders</strong>' +
          '<p class="muted">Every <code>/[Tag]</code> written anywhere in the document, filled in once here and ' +
          'replaced everywhere it appears. A tag left blank is printed as it stands, so an unfinished document ' +
          'looks unfinished rather than merely incomplete.</p>' +
          tagRows +
          (unfilled.length
            ? '<p class="rpt-omit"><strong>' + unfilled.length + '</strong> placeholder' + (unfilled.length === 1 ? '' : 's') +
              ' still to fill in: ' + unfilled.map(function (t) { return '<code>/[' + esc(t) + ']</code>'; }).join(' ') + '</p>'
            : (tags.length ? '<p class="rpt-omit muted">Every placeholder has a value.</p>' : '')) +
        '</div>' +
        '<div class="rd-fieldset"><strong>Generate</strong>' +
          '<p class="muted">' + (ready
            ? 'One <code>.md</code> for pandoc, exactly as the Preview shows it, or the same document as a printable <code>.html</code> page.'
            : 'This ' + esc(noun()) + ' is not ready — the host reports it incomplete.') + '</p>' +
          '<div class="rd-addbar">' +
            // The HOST wires these ([data-generate-action], reading data-generate-format):
            // where a file goes is its business, not the designer's.
            '<button type="button" class="primary" data-generate-action="document" data-generate-format="md"' + (ready ? '' : ' disabled') + '>Generate .md</button>' +
            '<button type="button" data-generate-action="document" data-generate-format="html"' + (ready ? '' : ' disabled') + '>Generate .html</button>' +
          '</div>' +
        '</div>' +
        /* The conversion, in full.
         *
         * It used to be half a sentence — `pandoc report.md -o report.pdf` — which is not
         * the command that produces this document: it names no engine, and it does not
         * pass the Lua filter every table in the file depends on. Run as written it either
         * failed or quietly produced a document with the tables broken. The three things
         * that actually go wrong are on Windows and none of them are LaTeX, so they are
         * here rather than in a troubleshooting page nobody reaches.
         */
        '<div class="rd-fieldset"><strong>Converting it to PDF</strong>' +
          '<p class="muted">One command — pandoc drives tectonic itself, so there is no second step. ' +
          'Run it in the folder holding both the <code>.md</code> and <code>pdfGenLuaConfig.lua</code>:</p>' +
          '<pre class="rd-cmd">pandoc report.md --lua-filter=pdfGenLuaConfig.lua --pdf-engine=tectonic -o report.pdf</pre>' +
          '<p class="muted">Or with full paths, from anywhere:</p>' +
          '<pre class="rd-cmd">pandoc "C:\\path\\to\\report.md" --lua-filter="C:\\path\\to\\pdfGenLuaConfig.lua" ' +
            '--pdf-engine=tectonic -o "C:\\path\\to\\report.pdf"</pre>' +
          '<p class="muted">The Lua filter is not optional: the tables in this document are built as LaTeX ' +
          '<code>longtable</code>s through it, and without it the shading, the merged title rows, the column ' +
          'widths and the line breaks inside cells are all lost.</p>' +
          '<p class="muted"><strong>Three things that bite on Windows.</strong></p>' +
          '<ul class="muted rd-cmdlist">' +
            '<li><strong>Both <code>pandoc.exe</code> and <code>tectonic.exe</code> must be on <code>PATH</code>.</strong> ' +
              'Pandoc calls tectonic by name, so one sitting in your Downloads folder will not be found even though ' +
              'you can double-click it. Check with <code>where pandoc</code> and <code>where tectonic</code> before ' +
              'blaming the document.</li>' +
            '<li><strong>Tectonic needs the internet the first time.</strong> It downloads the TeX packages it needs ' +
              'into a local cache; after that it works offline. (This tool never touches the network either way — ' +
              'the conversion is a separate step you run yourself.)</li>' +
            '<li><strong>Close the PDF in your viewer first.</strong> Acrobat holds an exclusive lock on Windows, and ' +
              'the build fails at the last step with a permissions error.</li>' +
          '</ul>' +
          '<p class="muted">To see what LaTeX complained about, send the log to a file — ' +
          '<code>… -o report.pdf 2&gt; tex.log</code> — and look for <code>Overfull \\hbox</code>. ' +
          'Anything over about 1pt means a table is running past the right margin; the sub-0.2pt ones are ' +
          'longtable rounding and are always there.</p>' +
          '<p class="muted">Verified against <strong>pandoc 3.1.11</strong> and <strong>tectonic 0.15.0</strong>.</p>' +
        '</div>';
    }

    // ======================================================================
    // RD-6: the preview
    // ======================================================================

    function buildPreview(project) {
      var selId = selectedSubjectId(project);
      if (!selId) return { html: '<p class="muted">No ' + esc(noun()) + ' selected.</p>', outline: [] };
      try {
        var out = H().build ? H().build(selId, opts()) : null;
        if (!out || !out.text) return { html: '<p class="muted">Nothing to preview.</p>', outline: [] };
        // SEC-4: the per-LEVEL page breaks live in the profile and reach the PDF as
        // titlesec's own hook, so there is no `\newpage` in the markdown for the
        // paginator to find. Handed in, they become a class it can break on.
        return App.ui.mdPreview.toHtml(out.text, null,
          { breaks: App.docFormat.levelBreaks(App.docFormat.resolve(project)) });
      } catch (e) {
        return { html: '<p class="rd-err">Preview failed: ' + esc(e && e.message) + '</p>', outline: [] };
      }
    }

    /* PRV-4: the running header and footer, drawn on a page of the preview.
     *
     * Only in PAGE view, and that is not a simplification — a continuous scroll has no
     * page edges to put them against, and drawing a "footer" halfway down a column of
     * text would be inventing a page boundary that the toggle is switched off precisely
     * to avoid claiming.
     *
     * The slots come from App.docFormat.headerFooter, which is the same call the LaTeX
     * preamble makes, so the classification banner lands in the same slot in both.
     */
    function runningSlots(set, n, total) {
      var any = App.docFormat.HF_SLOTS.some(function (s) { return set[s]; });
      if (!any) return '';
      return App.docFormat.HF_SLOTS.map(function (s) {
        // `#page` and `#pages` are LaTeX macros on the page; only the preview is in a
        // position to know what they will print, so this is where they become numbers.
        var text = App.docFormat.slotParts(set[s]).map(function (p) {
          return p.token === 'page' ? String(n) : p.token === 'pages' ? String(total) : p.text;
        }).join('');
        return '<span class="prv-hf-' + s + '">' + esc(text) + '</span>';
      }).join('');
    }

    /**
     * PRV-4: the document laid out as sheets of paper.
     *
     * The break positions cannot be computed here — a browser decides where a paragraph
     * ends only once it has laid it out, and this runs as a string. So the markup is a
     * single flow inside a page-height CLIP, and `paginate()` (below, after mount) walks
     * the laid-out children and moves them into as many sheets as they need. That keeps
     * the whole thing to one render path: page view and continuous view are the same
     * HTML, with the sheets built around it or not.
     */
    function pagedPaper(project, html) {
      var f = App.docFormat.resolve(project);
      var m = App.docFormat.pageMetrics(f);
      var hf = App.docFormat.headerFooter(f, { classification: opts().classification || '' });
      // Written as data attributes rather than inline styles so `paginate` can read the
      // numbers back without re-resolving the profile, and so a redraw cannot disagree
      // with the measurement that produced it.
      return '<style>' + App.docFormat.previewCss(f) + '</style>' +
        '<div class="rd-pages" data-prv-pages' +
          ' data-prv-pw="' + m.width + '" data-prv-ph="' + m.height + '"' +
          ' data-prv-mt="' + m.top + '" data-prv-mb="' + m.bottom + '"' +
          ' data-prv-ml="' + m.left + '" data-prv-mr="' + m.right + '"' +
          ' data-prv-first="' + (hf.firstDifferent ? '1' : '') + '"' +
          ' data-prv-hf="' + esc(JSON.stringify(hf)) + '">' +
          '<div class="rd-pageflow rd-paper">' + html + '</div>' +
        '</div>';
    }

    function panePreview(project) {
      var p = _rd.preview || (_rd.preview = buildPreview(project));
      var nav = p.outline.map(function (o) {
        return '<a class="rd-nav rd-nav-' + o.level + '" href="#' + esc(o.anchor) + '" data-prv-jump="' + esc(o.anchor) + '">' +
          (o.number ? '<span class="rd-nav-n">' + esc(o.number) + '</span> ' : '') + esc(o.title) + '</a>';
      }).join('');
      var paged = _rd.pages === true;
      return '<div class="rd-preview">' +
        '<div class="rd-addbar"><button type="button" data-rd-refresh-preview>↻ Refresh</button>' +
          // PRV-4: the toggle. Off is the view this pane has always had — one continuous
          // sheet — because that is the better one for reading what the document SAYS.
          // On answers the other question: where does it break, and what is on every page.
          '<label class="gen-opt"><input type="checkbox" data-rd-pageview' + (paged ? ' checked' : '') + '> Pages</label>' +
          '<span class="muted">' + (paged
            ? 'Laid out as it will be printed, with the header and footer on every page.'
            : 'This is the document the Generate button downloads, rendered from the same markdown.') + '</span></div>' +
        '<div class="rd-preview-body">' +
          '<nav class="rd-preview-nav">' + (nav || '<span class="muted">No sections.</span>') + '</nav>' +
          '<article class="rd-preview-doc' + (paged ? ' rd-preview-paged' : '') + '" id="rd-preview-doc">' +
            (paged ? pagedPaper(project, p.html) : paper(project, p.html)) + '</article>' +
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
      var omitted = omittedByRelevance(project, selId);

      var paneBody =
        _rd.pane === 'section' ? paneSection(project, view) :
        _rd.pane === 'relevance' ? paneRelevance(project) :
        _rd.pane === 'formatting' ? paneFormatting(project) :
        _rd.pane === 'headerfooter' ? paneHeaderFooter(project) :
        _rd.pane === 'templates' ? paneTemplates(project) :
        _rd.pane === 'generate' ? paneGenerate(project, view) :
        panePreview(project);

      var tabs = PANES.map(function (p) {
        return '<button type="button" class="rd-tab' + (_rd.pane === p.id ? ' on' : '') + '" data-rd-pane="' + p.id + '"' +
          (_rd.pane === p.id ? ' aria-current="true"' : '') + '>' + esc(p.label) + '</button>';
      }).join('');

      return '<div class="modal modal-full" role="dialog" aria-modal="true" aria-label="Report Design">' +
        '<div class="modal-head"><div><h3>Report Design</h3>' +
          '<div class="modal-sub">' + (subj ? esc(subj.label) + ' — what the document contains, in what order, and how it looks.' : 'No ' + esc(noun()) + ' selected.') + '</div></div>' +
          '<button type="button" class="modal-close" data-rd-close aria-label="Close">×</button></div>' +
        '<div class="modal-body"><div class="rpt-body rd-layout">' +
          renderSectionList(project, view) +
          '<div class="rd-right"><div class="rd-tabs">' + tabs + '</div>' +
            '<div class="rpt-pane rd-pane">' + paneBody + '</div></div>' +
        '</div></div>' +
        '<div class="modal-foot">' +
          '<span class="foot-summary">' + included + ' of ' + view.blocks.length + ' section' + (view.blocks.length === 1 ? '' : 's') + ' included' +
            (omitted ? ' &middot; ' + omitted + ' item' + (omitted === 1 ? '' : 's') + ' omitted by relevance' : '') +
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
    function refresh() {
      var host = document.getElementById('rd-modal-host');
      if (!host) return false;
      var project = App.docHost.get().getState(); if (!project) return false;
      if (!H()) return false;
      var body = host.querySelector('.modal-body');
      var top = body ? body.scrollTop : 0;
      var pane = host.querySelector('.rd-pane');
      var paneTop = pane ? pane.scrollTop : 0;
      host.innerHTML = inner(project);
      var again = host.querySelector('.modal-body');
      if (again) again.scrollTop = top;
      var pane2 = host.querySelector('.rd-pane');
      if (pane2) pane2.scrollTop = paneTop;
      return true;
    }
    /* PRV-4: cut the flow into sheets, once it has been laid out.
     *
     * This is the one thing in the workspace that cannot be done as a string: where a
     * page ends depends on how tall the content turned out to be, and nothing knows that
     * until the browser has laid it out. So the document is rendered as one flow and
     * then walked, block by block, moving each into the current sheet until the next one
     * would not fit.
     *
     * A TABLE is split across sheets rather than moved whole, because that is what a
     * longtable does on the page: the rows that fit stay, the rest continue overleaf
     * under a repeat of the header row. A table clipped at the page edge — which is what
     * moving it whole into a fixed-height sheet did — shows a document that is missing
     * most of its content, which is worse than a break in a slightly different place.
     *
     * Everything else is moved whole. A paragraph taller than a page gets a page of its
     * own and is allowed to overflow rather than being cut mid-line: LaTeX will break it
     * somewhere, and pretending to know where would be inventing a precise-looking
     * answer. A `\newpage` the document asked for (a page-break part, a section that
     * starts a page, a heading level that does) arrives as `.prv-pagebreak` and starts a
     * new sheet — those ARE exact.
     */
    function paginate() {
      var host = document.querySelector('[data-prv-pages]');
      if (!host) return;
      var flow = host.querySelector('.rd-pageflow');
      if (!flow) return;
      var num = function (k) { return Number(host.getAttribute('data-prv-' + k)) || 0; };
      var pw = num('pw'), ph = num('ph'), mt = num('mt'), mb = num('mb'), ml = num('ml'), mr = num('mr');
      var body = Math.max(80, ph - mt - mb);
      var hf;
      try { hf = JSON.parse(host.getAttribute('data-prv-hf') || '{}'); } catch (e) { hf = {}; }
      var firstDifferent = !!host.getAttribute('data-prv-first');

      /**
       * Take as many body rows off a table as will fit in `room`, in a clone of its
       * wrapper carrying the same header. Returns null when not even one row fits, so
       * the caller can start a fresh sheet and try again there.
       * @returns {?Element} the part that fits; the original keeps the remainder
       */
      function splitTable(el, room) {
        var table = el.querySelector('table');
        if (!table) return null;
        var tbody = table.querySelector('tbody');
        var rows = tbody ? Array.prototype.slice.call(tbody.rows) : [];
        if (rows.length < 2) return null;               // nothing to gain by splitting
        var head = table.tHead ? table.tHead.offsetHeight : 0;
        var used = head, take = 0;
        for (var i = 0; i < rows.length; i++) {
          var h = rows[i].offsetHeight || 0;
          // NOT "always take the first row": with no room left on the page, taking one
          // anyway put a header and a row past the bottom edge of a sheet that was
          // already full. Nothing fits means nothing fits, and the caller starts a
          // fresh sheet and asks again — where there is a whole page of room.
          if (used + h > room) break;
          used += h; take++;
        }
        // All of it fits, or none of it does — neither is a split.
        if (!take || take >= rows.length) return null;
        /* A DEEP clone, and the rows pruned from each half afterwards.
         *
         * The block being split is not always the table's own wrapper — a centred
         * section wraps it again, and a shallow clone of the outer div rebuilt the
         * table without whatever sat between the two, which lost the centring and the
         * column widths with it. Copying the whole subtree and then deleting rows keeps
         * every wrapper, the colgroup and the header exactly as they were.
         */
        var part = el.cloneNode(true);
        var partRows = part.querySelector('table tbody').rows;
        while (partRows.length > take) partRows[take].parentNode.removeChild(partRows[take]);
        for (var j = 0; j < take; j++) tbody.removeChild(tbody.rows[0]);
        // The caption belongs to the LAST part, where longtable prints it, so a caption
        // inside the wrapper is dropped from every part but the final one.
        var cap = part.querySelector('.prv-caption');
        if (cap) cap.parentNode.removeChild(cap);
        return part;
      }

      var blocks = Array.prototype.slice.call(flow.children);
      // jsdom has no layout, so every height reads 0 and one sheet holds everything.
      // That is the right degradation: the structure is still correct and testable, and
      // the measurement it cannot make is one only a real browser can.
      var sheets = [[]], used = 0;
      function newSheet() { sheets.push([]); used = 0; }
      function push(el, h) { sheets[sheets.length - 1].push(el); used += h; }
      function place(el) {
        var h = el.offsetHeight || 0;
        if (el.classList && el.classList.contains('prv-pagebreak')) {
          if (sheets[sheets.length - 1].length) newSheet();
          return;
        }
        // SEC-4: a heading whose level starts a page. The break belongs BEFORE it, and
        // only when there is already something on the sheet — a document that opens
        // with one should not begin with a blank page, which is what the PDF does too.
        if (el.classList && el.classList.contains('prv-breakbefore') && sheets[sheets.length - 1].length) {
          newSheet();
        }
        if (used + h <= body) { push(el, h); return; }
        // A table continues rather than being clipped: as much of it as fits goes here,
        // and what is left is placed again — on this sheet's successor, with a whole
        // page of room. Each pass takes at least one row, so this terminates.
        var part = splitTable(el, body - used);
        if (part) { push(part, body - used); newSheet(); place(el); return; }
        if (used) { newSheet(); place(el); return; }
        // Taller than a whole page and nothing to split: it gets a page of its own and
        // is allowed to run over rather than being cut at a line nobody chose.
        push(el, h);
      }
      blocks.forEach(place);

      var total = sheets.length;
      var frag = document.createDocumentFragment();
      sheets.forEach(function (list, i) {
        var n = i + 1;
        var first = firstDifferent && n === 1;
        var sheet = document.createElement('div');
        sheet.className = 'rd-sheet';
        sheet.setAttribute('data-prv-sheet', String(n));
        sheet.style.width = pw + 'px';
        sheet.style.height = ph + 'px';
        var head = runningSlots(hf[first ? 'firstHeader' : 'header'] || {}, n, total);
        var foot = runningSlots(hf[first ? 'firstFooter' : 'footer'] || {}, n, total);
        // The margins are the sheet's, so the header sits INSIDE the top margin and the
        // footer inside the bottom one, as they do on the page.
        var pad = ' style="padding:0 ' + mr + 'px 0 ' + ml + 'px;';
        sheet.innerHTML =
          '<div class="rd-sheet-hf rd-sheet-head"' + pad + 'height:' + mt + 'px">' + head + '</div>' +
          '<div class="rd-sheet-body rd-paper"' + pad + 'height:' + body + 'px">' + '</div>' +
          '<div class="rd-sheet-hf rd-sheet-foot"' + pad + 'height:' + mb + 'px">' + foot + '</div>' +
          '<div class="rd-sheet-n">' + n + ' / ' + total + '</div>';
        var target = sheet.querySelector('.rd-sheet-body');
        list.forEach(function (el) { target.appendChild(el); });
        frag.appendChild(sheet);
      });
      flow.parentNode.removeChild(flow);
      host.appendChild(frag);
    }

    function repaint() {
      if (!refresh() && _ctx) _ctx.refreshMain();
      // The workspace re-renders as a string; the sheets are built from what that string
      // became, so this runs after every repaint that could have drawn a paged preview.
      if (_rd.open && _rd.pane === 'preview' && _rd.pages) paginate();
    }
    function quietly(fn) { if (_ctx && _ctx.quietEdit) _ctx.quietEdit(fn); else fn(); }
    /** Any project write invalidates the cached preview — it is a render of the project. */
    function dirty() { _rd.preview = null; }

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
    }

    /** RTX-1: one entry point for all three surfaces — the button says which box. */
    function wrapSelection(btn, tag) { insertToken(boxFor(btn), tag); }

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

      dom.on(ctx.root, 'click', '[data-rd-open]', function () {
        _rd.open = true; dirty(); ctx.refreshMain();
        if (_rd.pane === 'preview' && _rd.pages) paginate();
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
      dom.on(ctx.root, 'click', '[data-rd-optmenu]', function (e, el) {
        var id = el.getAttribute('data-rd-optmenu');
        _rd.optMenu = _rd.optMenu === id ? null : id;
        repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-select]', function (e, el) {
        _rd.selected = el.getAttribute('data-rd-select');
        repaint();
      });
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
      // PRV-4: page view is a way of LOOKING at the document, not a change to it, so it
      // does not invalidate the rendered markdown — only how it is laid out.
      dom.on(ctx.root, 'change', '[data-rd-pageview]', function (e, el) { _rd.pages = el.checked; repaint(); });
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
          var block = (outlineNow(P()).blocks || []).filter(function (b) { return (b.dsId || b.kind) === ds; })[0];
          var cols = block ? App.docGen.sectionColumns(H(), block, opts()) : null;
          var col = ((cols && cols.optional) || []).filter(function (c) { return c.id === key; })[0];
          dflt = !col || col.defaultOff !== true;
        }
        include(map, ds, key, el.checked, dflt);
      });
      // GEN-TAB: the filename and the placeholder values. Session state, like the
      // relevance filter beside them — a tag value is an answer for THIS run.
      dom.on(ctx.root, 'change', '[data-rd-filename]', function (e, el) {
        session().filename = el.value;
        repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-tag]', function (e, el) {
        var s = session();
        s.tags = s.tags || {};
        var k = el.getAttribute('data-rd-tag');
        if (String(el.value).trim()) s.tags[k] = el.value; else delete s.tags[k];
        dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-rel]', function (e, el) {
        var k = el.getAttribute('data-rd-rel');
        // RPT-2: IRRELEVANT is the one category that starts excluded, so it is the one
        // whose default is `false` — including it is the departure worth recording.
        // The category's own declared default, so a tick returned to it stores nothing.
        var cat = ((H().filter && H().filter.categories()) || []).filter(function (c) { return c.key === k; })[0];
        var dflt = !cat || cat.defaultOn !== false;
        include('relevance', k, null, el.checked, dflt);
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
      dom.on(ctx.root, 'change', '[data-rd-centre]', function (e, el) {
        quietly(function () { logIssues(App.docStore.setBlockCentre(el.getAttribute('data-rd-centre'), el.checked)); });
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
      dom.on(ctx.root, 'change', '[data-rd-tstyle]', function (e, el) {
        quietly(function () {
          logIssues(App.docStore.setBlockTableStyle(el.getAttribute('data-rd-block'), el.getAttribute('data-rd-tstyle'), el.checked));
        });
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
       * docStore, and the .md is what proves it landed.
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

      // ---- formatting -------------------------------------------------------
      dom.on(ctx.root, 'change', '[data-rd-fmt-active]', function (e, el) {
        quietly(function () { logIssues(App.docStore.setFormatId(el.value)); });
        _rd.fmtId = el.value; dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-fmt-edit]', function (e, el) { _rd.fmtId = el.value; repaint(); });
      dom.on(ctx.root, 'click', '[data-rd-fmt-new]', function () {
        var project = P(); if (!project) return;
        var from = App.docFormat.list(project).filter(function (x) { return x.id === (_rd.fmtId || App.docFormat.resolve(project).id); })[0];
        var name = window.prompt('Name for the new profile:', (from ? from.name : 'Standard') + ' copy');
        if (name == null || !name.trim()) return;
        var res = logIssues(App.docStore.addFormat(name, from));
        if (res.id) { _rd.fmtId = res.id; App.docStore.setFormatId(res.id); }
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-fmt-del]', function () {
        if (!_rd.fmtId || _rd.fmtId === 'standard') return;
        if (!window.confirm('Delete this formatting profile? Any document using it falls back to Standard.')) return;
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
        quietly(function () { logIssues(App.docStore.updateFormat(id, patch)); });
        dirty(); repaint();
      }
      dom.on(ctx.root, 'change', '[data-rd-titleblock]', function (e, el) {
        quietly(function () { logIssues(App.docStore.setTitleBlock(el.checked)); });
        dirty(); repaint();
      });
      // HDR-1: a slot writes through the same dotted-path patcher every other profile
      // field uses, so nothing new has to know how a profile is saved.
      dom.on(ctx.root, 'change', '[data-rd-hf-set]', function (e, el) {
        fmtPatch('headerFooter.' + el.getAttribute('data-rd-hf-set') + '.' + el.getAttribute('data-rd-hf-slot'), el.value);
      });
      dom.on(ctx.root, 'change', '[data-rd-hf-first]', function (e, el) {
        fmtPatch('headerFooter.firstDifferent', el.checked);
      });
      dom.on(ctx.root, 'change', '[data-rd-fmt]', function (e, el) { fmtPatch(el.getAttribute('data-rd-fmt'), el.value); });
      dom.on(ctx.root, 'change', '[data-rd-fmt-bool]', function (e, el) { fmtPatch(el.getAttribute('data-rd-fmt-bool'), el.checked); });
      // TBS-1: a colour picker has no "none" — white is a colour, and a white shade over
      // a white page is not the same thing as no shade at all in the emitted LaTeX.
      dom.on(ctx.root, 'click', '[data-rd-fmt-clear]', function (e, el) { fmtPatch(el.getAttribute('data-rd-fmt-clear'), ''); });

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
      buildPreview: buildPreview,
      PANES: PANES, _rd: _rd
    };
  })(App);

export { App };
export default App;
