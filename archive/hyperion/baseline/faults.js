/**
 * Fault-point harness: the JavaScript equivalent of the framework's
 * templates/baseline/faults.py (DEC-003; CORE-TST-002, rung 3). Names match the template
 * so the framework's rule reads the same: every `fault_point("name")` literal under
 * modules/<m>/src/ or baseline/ must be armed by at least one passing test under
 * modules/<m>/conformance/ (CORE-TRC-003, Fault points).
 *
 * A fault point is a named point in an operation that does nothing in production and
 * throws when a test has armed it. It lets a conformance test force failure at step N of a
 * multi-step operation, which is the reproducing test a partial-failure finding
 * (AGT-LNS-001) must carry. Place points where such a finding would name a step: after a
 * call that can fail and before state is committed, never speculatively.
 *
 * In an implementation:
 *
 *     import { fault_point } from '../../../baseline/faults.js';
 *     ...
 *     fault_point('store.save.commit');   // C-nnn test hook; no-op unless armed
 *
 * In a conformance test:
 *
 *     import { arm, disarm_all, InjectedFault } from '../../../baseline/faults.js';
 *
 *     test('no residual state after a mid-save failure (C-nnn)', async () => {
 *       arm('store.save.commit');
 *       try {
 *         await assert.rejects(() => store.save(data), InjectedFault);
 *       } finally {
 *         disarm_all();
 *       }
 *       assert.deepEqual(await store.load(), before);   // still serves its contract
 *     });
 */

export class InjectedFault extends Error {
  /** @param {string} faultPoint */
  constructor(faultPoint) {
    super(`injected fault at ${faultPoint}`);
    this.name = 'InjectedFault';
    this.faultPoint = faultPoint;
  }
}

/** @type {Map<string, Error>} */
const armed = new Map();

/**
 * No-op in production; throws the armed error when a test has armed `name`.
 * @param {string} name
 */
export function fault_point(name) {
  const error = armed.get(name);
  if (error !== undefined) throw error;
}

/**
 * Make the next `fault_point(name)` throw `error` (default `new InjectedFault(name)`).
 * @param {string} name
 * @param {Error} [error]
 */
export function arm(name, error) {
  armed.set(name, error ?? new InjectedFault(name));
}

/** Clear every armed point. Call in the test's finally block. */
export function disarm_all() {
  armed.clear();
}

/** @returns {string[]} the names currently armed, for a test that checks its own cleanup */
export function armed_points() {
  return [...armed.keys()].sort();
}
