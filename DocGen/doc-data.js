/* =============================================================================
 * MODULE: doc-data — register data in a document
 * PURPOSE: Field tokens ({{f:collection.field?options}}), fill tokens
 *          ({{fill:id?label=…}}), and how they read against a SCOPE: the chain of
 *          entries a piece of text sits inside, outermost (the root) first.
 *          Also the filter and sort every repeat shares.
 * PURITY:  pure. No DOM, no I/O, no clock.
 * DEPENDS: nothing
 *
 * The host declares a CATALOGUE: { root, collections: { id: { label, plural?,
 * fields: [{ id, label, type }], children: [collectionId] } }, data }. `data` is the
 * root ENTRY bound to the run, or null: { key, values: { fieldId: Value },
 * children: { collectionId: Entry[] } }. A Value is a string, { text, sort }, or an
 * array of either (a list). Nothing here knows what any collection is.
 * ============================================================================= */

/** The filter's operators. `gte`/`lte` compare sort keys; the rest compare printed text. */
export const OPS = ['is', 'not', 'has', 'empty', 'set', 'gte', 'lte'];
export const OP_LABELS = { is: 'is', not: 'is not', has: 'contains', empty: 'is empty', set: 'is not empty', gte: 'is at least', lte: 'is at most' };
/** How a list prints. */
export const LIST_STYLES = ['lines', 'num', 'bullet', 'comma'];
export const EMPTY_TEXT = 'Nil';

// encodeURIComponent leaves these alone; the token grammar does not allow them.
const enc = (s) => encodeURIComponent(String(s)).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const dec = (s) => { try { return decodeURIComponent(s); } catch (e) { return s; } };

/** The options part of a tag, `a=1&b=2`, as an object of decoded strings. */
function readOpts(q) {
  const out = {};
  String(q || '').split('&').forEach((pair) => {
    if (!pair) return;
    const at = pair.indexOf('=');
    if (at < 1) return;
    out[pair.slice(0, at)] = pair.slice(at + 1);
  });
  return out;
}

/**
 * `f:hazard.title?sort=date:desc&where=type:is:Near%20miss&list=num&empty=None`
 * @returns {{coll:string, field:string, opts:{sort?:{field:string,dir:string}, where?:{field:string,op:string,value:string}, list?:string, empty?:string}} | null}
 */
export function parseFieldTag(tag) {
  const m = /^f:([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)(?:\?(.*))?$/.exec(String(tag || ''));
  if (!m) return null;
  const raw = readOpts(m[3]);
  const opts = {};
  if (raw.sort) {
    const [field, dir] = raw.sort.split(':');
    if (field) opts.sort = { field: dec(field), dir: dir === 'desc' ? 'desc' : 'asc' };
  }
  if (raw.where) {
    const bits = raw.where.split(':');
    if (bits[0] && OPS.includes(bits[1])) opts.where = { field: dec(bits[0]), op: bits[1], value: dec(bits.slice(2).join(':')) };
  }
  if (raw.list && LIST_STYLES.includes(raw.list)) opts.list = raw.list;
  if (raw.empty !== undefined) opts.empty = dec(raw.empty);
  return { coll: m[1], field: m[2], opts };
}

/** The tag for a field; options at their defaults are left out. */
export function fieldTag(coll, field, opts) {
  const o = opts || {};
  const q = [];
  if (o.sort && o.sort.field) q.push('sort=' + enc(o.sort.field) + (o.sort.dir === 'desc' ? ':desc' : ''));
  if (o.where && o.where.field && OPS.includes(o.where.op)) q.push('where=' + enc(o.where.field) + ':' + o.where.op + ':' + enc(o.where.value == null ? '' : o.where.value));
  if (o.list && o.list !== 'lines' && LIST_STYLES.includes(o.list)) q.push('list=' + o.list);
  if (o.empty !== undefined && o.empty !== EMPTY_TEXT) q.push('empty=' + enc(o.empty));
  return 'f:' + coll + '.' + field + (q.length ? '?' + q.join('&') : '');
}

/** `fill:fill3?label=Control%20rationale` → { id, label } */
export function parseFillTag(tag) {
  const m = /^fill:([A-Za-z0-9_-]+)(?:\?(.*))?$/.exec(String(tag || ''));
  if (!m) return null;
  const raw = readOpts(m[2]);
  return { id: m[1], label: raw.label !== undefined ? dec(raw.label) : '' };
}
export function fillTag(id, label) {
  return 'fill:' + id + (String(label || '').trim() ? '?label=' + enc(String(label).trim()) : '');
}

/** What a value prints. */
export function textOf(v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(textOf).filter(Boolean).join(', ');
  if (typeof v === 'object') return v.text === null || v.text === undefined ? '' : String(v.text);
  return String(v);
}
/** What a value sorts and compares by. */
export function sortOf(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v.sort === undefined ? textOf(v) : v.sort;
  return textOf(v);
}
function cmp(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}
const itemsOf = (v) => (Array.isArray(v) ? v : (v === null || v === undefined || textOf(v) === '' ? [] : [v]));

/** Whether an entry passes a filter. No filter, or a field the entry lacks, passes. */
export function matches(entry, where) {
  if (!where || !where.field || !OPS.includes(where.op)) return true;
  const values = (entry && entry.values) || {};
  if (!Object.prototype.hasOwnProperty.call(values, where.field)) return true;
  const items = itemsOf(values[where.field]).filter((x) => textOf(x) !== '');
  const want = String(where.value == null ? '' : where.value).trim().toLowerCase();
  const text = (x) => textOf(x).trim().toLowerCase();
  switch (where.op) {
    case 'empty': return items.length === 0;
    case 'set': return items.length > 0;
    case 'is': return items.some((x) => text(x) === want);
    case 'not': return !items.some((x) => text(x) === want);
    case 'has': return items.some((x) => text(x).indexOf(want) !== -1);
    case 'gte': case 'lte': {
      return items.some((x) => {
        const k = sortOf(x);
        const v = typeof k === 'number' && String(where.value).trim() !== '' && isFinite(Number(where.value)) ? Number(where.value) : where.value;
        const c = cmp(k, typeof k === 'number' ? v : String(v));
        return where.op === 'gte' ? c >= 0 : c <= 0;
      });
    }
    default: return true;
  }
}

/** Entries filtered, then sorted by a field's sort key (stable: ties keep their order). */
export function select(entries, where, sort) {
  const kept = (entries || []).filter((e) => matches(e, where));
  if (!sort || !sort.field) return kept;
  const dir = sort.dir === 'desc' ? -1 : 1;
  const has = (e) => e && e.values && Object.prototype.hasOwnProperty.call(e.values, sort.field);
  if (!kept.some(has)) return kept;
  return kept.map((e, i) => ({ e, i })).sort((a, b) => {
    const c = cmp(sortOf(a.e.values[sort.field]), sortOf(b.e.values[sort.field]));
    return c ? c * dir : a.i - b.i;
  }).map((x) => x.e);
}

/** The scope at the root of the document: the root entry, or nothing when unbound. */
export function rootScope(data, rootColl) {
  return data ? [{ coll: rootColl || 'platform', entry: data }] : [];
}
/** The innermost entry of a collection in a scope. */
export function inScope(scope, coll) {
  for (let i = (scope || []).length - 1; i >= 0; i--) if (scope[i].coll === coll) return scope[i].entry;
  return null;
}
/** The children of a collection under the innermost scope entry whose collection holds them (per the catalogue). */
export function childrenIn(scope, coll, catalogue) {
  for (let i = (scope || []).length - 1; i >= 0; i--) {
    const def = catalogue && catalogue.collections && catalogue.collections[scope[i].coll];
    if (def && (def.children || []).includes(coll)) return ((scope[i].entry.children || {})[coll]) || [];
  }
  return null;
}

/** The field a catalogue declares, or null. */
export function fieldDef(catalogue, coll, field) {
  const c = catalogue && catalogue.collections && catalogue.collections[coll];
  return (c && (c.fields || []).find((f) => f.id === field)) || null;
}

/**
 * Which collections a scope of COLLECTION ids reaches: those in it (single values) and
 * the children of those not themselves in it (lists).
 */
export function available(collsInScope, catalogue) {
  const single = (collsInScope || []).filter((c, i, a) => a.indexOf(c) === i && catalogue.collections[c]);
  const lists = [];
  single.forEach((c) => (catalogue.collections[c].children || []).forEach((k) => {
    if (!single.includes(k) && !lists.includes(k) && catalogue.collections[k]) lists.push(k);
  }));
  return { single, lists };
}

/**
 * A field token read against a scope.
 * @returns {{kind:'value', text:string} | {kind:'list', items:string[]} | {kind:'unknown'} | {kind:'unbound'}}
 */
export function resolveField(scope, parsed, catalogue) {
  if (!parsed || !fieldDef(catalogue, parsed.coll, parsed.field)) return { kind: 'unknown' };
  if (!scope || !scope.length) return { kind: 'unbound' };
  const listOf = (v) => itemsOf(v).map(textOf);
  const own = inScope(scope, parsed.coll);
  if (own) {
    const v = (own.values || {})[parsed.field];
    return Array.isArray(v) ? { kind: 'list', items: listOf(v) } : { kind: 'value', text: textOf(v) };
  }
  const kids = childrenIn(scope, parsed.coll, catalogue);
  if (!kids) return { kind: 'unknown' };
  const o = parsed.opts || {};
  return { kind: 'list', items: [].concat(...select(kids, o.where, o.sort).map((e) => listOf((e.values || {})[parsed.field]))) };
}

/** What a resolved field prints, per its list style and empty wording. */
export function fieldText(res, opts) {
  const o = opts || {};
  const empty = o.empty !== undefined && String(o.empty).trim() !== '' ? String(o.empty) : EMPTY_TEXT;
  if (!res) return empty;
  if (res.kind === 'value') return String(res.text || '').trim() ? res.text : empty;
  if (res.kind !== 'list') return '';
  const items = res.items.filter((x) => String(x || '').trim());
  if (!items.length) return empty;
  switch (o.list) {
    case 'num': return items.map((x, i) => (i + 1) + '. ' + x).join('\n');
    case 'bullet': return items.map((x) => '• ' + x).join('\n');
    case 'comma': return items.join(', ');
    default: return items.join('\n');
  }
}

/** The key of the entries a scope holds below the root: `hazard:h1/control:c3`. */
export function instanceKey(scope) {
  return (scope || []).slice(1).map((s) => s.coll + ':' + s.entry.key).join('/');
}

// A field or fill token, wherever it is written: the same two shapes App.md reads.
const MARKER = /\{\{(f:[A-Za-z0-9._-]+(?:\?[A-Za-z0-9._~%&=:-]*)?|fill:[A-Za-z0-9_-]+(?:\?[A-Za-z0-9._~%&=:-]*)?)\}\}/g;

/*
 * Register text is never markup and never a placeholder. Field values are PROTECTED on their
 * way into a document — the openings of a `/[Tag]` and of a `{{token}}` swapped for private-use
 * characters nothing else reads — and the builder puts them back once tags are filled in and
 * captions read, so a hazard titled "Fire /[Date] {{b}}" prints exactly that.
 */
export function protect(s) { return String(s == null ? '' : s).replace(/\/\[/g, '\uE000').replace(/\{\{/g, '\uE001'); }
export function unprotect(s) { return String(s == null ? '' : s).replace(/\uE000/g, '/[').replace(/\uE001/g, '{{'); }

/** A field's label, for where a field shows by name. */
export function fieldLabelOf(catalogue, parsed) {
  const def = parsed && fieldDef(catalogue, parsed.coll, parsed.field);
  return def ? def.label : (parsed ? parsed.coll + '.' + parsed.field : 'field');
}

/**
 * Text with no markup of its own (a heading, a caption) with its fields filled in: one line,
 * a list joined with commas unless it asks for another style.
 */
export function plainFields(s, scope, catalogue) {
  return String(s == null ? '' : s).replace(MARKER, (whole, tag) => {
    if (tag.indexOf('fill:') === 0) { const fl = parseFillTag(tag); return '[To fill in: ' + ((fl && fl.label) || 'text') + ']'; }
    const p = parseFieldTag(tag);
    const r = catalogue ? resolveField(scope, p, catalogue) : { kind: 'unknown' };
    if (r.kind === 'unknown') return '[unknown field]';
    if (r.kind === 'unbound') return '‹' + fieldLabelOf(catalogue, p) + '›';
    const o = Object.assign({}, p.opts);
    if (r.kind === 'list' && !o.list) o.list = 'comma';
    return protect(fieldText(r, o).replace(/\s*\n\s*/g, ' '));
  });
}

/** Contents and Metadata print once, where they are: they are never part of a repeat. */
const SINGLE = { toc: true, meta: true };
const TITLE = 0;

/**
 * DS-2: the document's blocks with each repeating group replaced by a copy per entry.
 *
 * A custom block with `repeat: { each, where?, sort? }` repeats WITH the blocks after it whose
 * resolved level is deeper (body text included, a title not), up to the next at its level or
 * above. Each copy, and every block inside it, gets its id and its parts' ids suffixed with the
 * entry keys (`s1~h1`, `c~h1~c3`), its level pinned to the one its template resolved to (an
 * automatic level would drift under the previous copy's sub-headings), and its SCOPE — the chain
 * of entries its fields read from. Headings and captions are plain text, so their fields are
 * filled in here; everything else is read at render time with the scope.
 *
 * @param {Array<Object>} blocks the included blocks, in order
 * @param {?Object} catalogue the host's, bound or not
 * @param {Object<string, number>} levels each block's resolved level, by id
 */
export function expandRepeats(blocks, catalogue, levels) {
  const cat = catalogue || null;
  const root = cat ? rootScope(cat.data, cat.root) : [];
  const lv = (b) => (levels && levels[b.id] !== undefined && levels[b.id] !== null ? levels[b.id] : b.level);
  const deeper = (a, than) => a !== TITLE && typeof a === 'number' && typeof than === 'number' && a > than;
  const out = [];
  const caption = (v, scope) => (typeof v === 'string' ? plainFields(v, scope, cat) : v);

  function emit(b, scope, suffix, pin) {
    const c = Object.assign({}, b, { scope });
    if (typeof b.title === 'string') c.title = plainFields(b.title, scope, cat);
    if (typeof b.label === 'string') c.label = plainFields(b.label, scope, cat);
    if (suffix) { c.id = b.id + suffix; c.templateId = b.id; c.suffix = suffix; }
    if (pin) c.level = lv(b);
    if (Array.isArray(b.parts)) c.parts = expandParts(b.parts, scope, suffix, false);
    out.push(c);
  }

  /**
   * DS-4: a block's parts with each Repeat part replaced by its parts once per item; a part
   * printed inside one carries the scope it reads its fields in (`scope`).
   */
  function expandParts(parts, scope, suffix, inner) {
    const res = [];
    parts.forEach((p) => {
      if (p && p.kind === 'repeat') {
        const each = p.repeat && p.repeat.each;
        if (!each || !scope.length) return;               // nothing to repeat for, or unbound
        const kids = childrenIn(scope, each, cat);
        if (kids === null) { expandParts(p.parts || [], scope, suffix, inner).forEach((q) => res.push(q)); return; }
        select(kids, p.repeat.where, p.repeat.sort).forEach((e) => {
          expandParts(p.parts || [], scope.concat([{ coll: each, entry: e }]), suffix + '~' + e.key, true).forEach((q) => res.push(q));
        });
        return;
      }
      const q = Object.assign({}, p, { id: suffix ? p.id + suffix : p.id });
      // A copy knows the part it was made from, and the entries it was made for.
      if (suffix) { q.tplId = p.id; q.sfx = suffix; }
      if (inner) q.scope = scope;
      if (typeof p.caption === 'string') q.caption = caption(p.caption, scope);
      if (Array.isArray(p.images)) q.images = p.images.map((im) => (im && typeof im.caption === 'string' ? Object.assign({}, im, { caption: caption(im.caption, scope) }) : im));
      res.push(q);
    });
    return res;
  }

  function walk(list, scope, suffix) {
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!(b.kind === 'custom' && b.repeat && b.repeat.each)) { emit(b, scope, suffix, !!suffix); continue; }
      let j = i + 1;
      while (j < list.length && deeper(lv(list[j]), lv(b))) j++;
      const group = list.slice(i + 1, j);
      i = j - 1;
      group.filter((x) => SINGLE[x.kind]).forEach((x) => emit(x, scope, '', false));
      const rest = group.filter((x) => !SINGLE[x.kind]);
      if (!scope.length) continue;                       // unbound: no entries to repeat for
      const kids = childrenIn(scope, b.repeat.each, cat);
      if (kids === null) { emit(b, scope, suffix, !!suffix); walk(rest, scope, suffix); continue; }
      select(kids, b.repeat.where, b.repeat.sort).forEach((e) => {
        const s2 = scope.concat([{ coll: b.repeat.each, entry: e }]);
        const suf = suffix + '~' + e.key;
        emit(b, s2, suf, true);
        walk(rest, s2, suf);
      });
    }
  }
  walk(blocks || [], root, '');
  return out;
}

/**
 * Text with one marker token replaced: the one at `at` when it is still there, else the first
 * with the same tag (the text moved under it), else nothing changes.
 */
export function replaceMarker(text, at, oldTag, newTag) {
  const t = String(text == null ? '' : text);
  const was = '{{' + oldTag + '}}', now = '{{' + newTag + '}}';
  if (t.substr(at, was.length) === was) return t.slice(0, at) + now + t.slice(at + was.length);
  const k = t.indexOf(was);
  return k === -1 ? t : t.slice(0, k) + now + t.slice(k + was.length);
}
