/**
 * JSON with object keys sorted at every level: the same value always gives the same text,
 * which is what the integrity hash and every "did this change?" comparison need.
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalJson(value) {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      /** @type {Record<string, unknown>} */
      const out = {};
      for (const k of Object.keys(v).sort()) out[k] = v[k];
      return out;
    }
    return v;
  });
}

/** @param {unknown} a @param {unknown} b */
export function sameJson(a, b) {
  return canonicalJson(a) === canonicalJson(b);
}
