/**
 * Whether two words are the same but for at most one slip: a wrong, missing or extra letter, or
 * two neighbouring letters swapped. @param {string} a @param {string} b
 */
function withinOne(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  if (a.length === b.length) {
    while (a[i] === b[i]) i += 1;
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  while (i < short.length && short[i] === long[i]) i += 1;
  return short.slice(i) === long.slice(i + 1);
}

/**
 * Whether a search finds a piece of text: every word of the search is in it, or (for a word of four
 * letters or more) is one slip from one of its words, or from the start of one ("contrl" finds
 * "controls"); two words written together count as one ("bowtie" finds "Bow-ties").
 * @param {string} text @param {string} query
 */
export function pickMatches(text, query) {
  const want = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!want.length) return true;
  const t = text.toLowerCase();
  const split = t.split(/[^a-z0-9]+/).filter(Boolean);
  // Each word, and each pair run together, so "bowtie" finds "Bow-ties".
  const words = [...split, ...split.slice(1).map((x, i) => split[i] + x)];
  return want.every((w) => t.includes(w) || (w.length >= 4 && words.some((x) => withinOne(x, w)
    || [w.length - 1, w.length, w.length + 1].some((n) => n < x.length && withinOne(x.slice(0, n), w)))));
}
