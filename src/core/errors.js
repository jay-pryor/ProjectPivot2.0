/** The one error type Pivot's own code throws. The UI shows `message`; `code` is for tests and branching. */
export class PivotError extends Error {
  /**
   * @param {string} code
   * @param {string} message one plain sentence a user can read
   * @param {Record<string, unknown>} [details]
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PivotError';
    this.code = code;
    this.details = details;
  }
}
