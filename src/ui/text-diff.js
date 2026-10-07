/**
 * Which words of a text were taken out and which put in, between an old version and a new one: the
 * longest run of words the two share is kept, and the rest is marked. Words and the spaces between
 * them are separate pieces, so the text joins back exactly as it was.
 */

/** @typedef {{ text: string, changed: boolean }} Piece */

/** A text as words and the spaces between them. @param {string} s @returns {string[]} */
const pieces = (s) => String(s ?? '').match(/\s+|[^\s]+/g) ?? [];

/** Beyond this many word pairs to compare, the whole of each side is shown as changed. */
const LIMIT = 4_000_000;

/**
 * The old text with what was taken out marked, and the new with what was put in marked.
 * @param {string} before @param {string} after
 * @returns {{ before: Piece[], after: Piece[] }}
 */
export function wordDiff(before, after) {
  const a = pieces(before);
  const b = pieces(after);
  if (a.length * b.length > LIMIT) {
    return { before: a.length ? [{ text: a.join(''), changed: true }] : [], after: b.length ? [{ text: b.join(''), changed: true }] : [] };
  }
  // The length of the longest common run from each pair of places onward.
  const n = a.length;
  const m = b.length;
  const run = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) run[i][j] = a[i] === b[j] ? run[i + 1][j + 1] + 1 : Math.max(run[i + 1][j], run[i][j + 1]);
  }
  /** @type {Piece[]} */ const out1 = [];
  /** @type {Piece[]} */ const out2 = [];
  /** @param {Piece[]} list @param {string} text @param {boolean} changed */
  const add = (list, text, changed) => {
    const last = list.at(-1);
    if (last && last.changed === changed) last.text += text; else list.push({ text, changed });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { add(out1, a[i], false); add(out2, b[j], false); i += 1; j += 1; } else if (run[i + 1][j] >= run[i][j + 1]) { add(out1, a[i], true); i += 1; } else { add(out2, b[j], true); j += 1; }
  }
  for (; i < n; i += 1) add(out1, a[i], true);
  for (; j < m; j += 1) add(out2, b[j], true);
  // A change that is only spaces is not worth marking.
  for (const list of [out1, out2]) for (const p of list) if (p.changed && !p.text.trim()) p.changed = false;
  return { before: out1, after: out2 };
}
