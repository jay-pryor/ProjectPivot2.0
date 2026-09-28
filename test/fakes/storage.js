/** An in-memory `localStorage` that can be made full, or refuse reads, as a real one can. */
export class MemoryStorage {
  constructor() {
    /** @type {Map<string, string>} */
    this.items = new Map();
    /** @type {Error | null} */
    this.setError = null;
    /** @type {Error | null} */
    this.getError = null;
  }
  /** @param {string} key */
  getItem(key) {
    if (this.getError) throw this.getError;
    return this.items.has(key) ? /** @type {string} */ (this.items.get(key)) : null;
  }
  /** @param {string} key @param {string} value */
  setItem(key, value) {
    if (this.setError) throw this.setError;
    this.items.set(key, String(value));
  }
  /** @param {string} key */
  removeItem(key) {
    this.items.delete(key);
  }
  fill() {
    this.setError = new DOMException('the quota has been exceeded', 'QuotaExceededError');
  }
  refuseReads() {
    this.getError = new DOMException('access to storage is denied', 'SecurityError');
  }
}
