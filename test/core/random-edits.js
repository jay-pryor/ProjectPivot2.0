import { PivotError } from '../../src/core/errors.js';
import { createHazard, updateHazard, retireHazard, deleteHazard, restoreRecord, addCausalFactor, deleteCausalFactor } from '../../src/core/ops/hazards.js';
import { createControl, updateControl, retireControl, deleteControl, linkControl, unlinkControl } from '../../src/core/ops/controls.js';
import { createPlatform, linkHazard, unlinkHazard, setReportId, retirePlatform } from '../../src/core/ops/platforms.js';
import { confirmControl, excludeControl, resetControl, setRating } from '../../src/core/ops/assessment.js';

/** A small, seeded pseudo-random generator (mulberry32), so a failure can be replayed. @param {number} seed */
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @template T @param {() => number} rand @param {T[]} xs @returns {T} */
const pick = (rand, xs) => xs[Math.floor(rand() * xs.length)];

/**
 * One random user action through the real ops. An action the ops refuse leaves the data as it was.
 * @param {import('../../src/core/data.js').Data} d @param {() => number} rand @param {{ by: string, at: string }} act
 */
export function randomEdit(d, rand, act) {
  const hz = Object.keys(d.records.hazard);
  const ct = Object.keys(d.records.control);
  const pl = Object.keys(d.records.platform);
  const cf = Object.keys(d.records.causalFactor);
  const n = () => String(Math.floor(rand() * 1000));
  const triple = () => ({ hazardId: pick(rand, hz), controlId: pick(rand, ct), platformId: pick(rand, pl) });
  const actions = [
    () => createHazard(d, act, { title: `Hazard ${n()}` }),
    () => updateHazard(d, act, { id: pick(rand, hz), title: `Title ${n()}` }),
    () => retireHazard(d, act, { id: pick(rand, hz) }),
    () => deleteHazard(d, act, { id: pick(rand, hz) }),
    () => restoreRecord(d, act, { kind: 'hazard', id: pick(rand, hz) }),
    () => addCausalFactor(d, act, { hazardId: pick(rand, hz), text: `Cause ${n()}` }),
    () => deleteCausalFactor(d, act, { id: pick(rand, cf) }),
    () => createControl(d, act, { title: `Control ${n()}` }),
    () => updateControl(d, act, { id: pick(rand, ct), title: `Control ${n()}` }),
    () => retireControl(d, act, { id: pick(rand, ct) }),
    () => deleteControl(d, act, { id: pick(rand, ct) }),
    () => linkControl(d, act, { hazardId: pick(rand, hz), controlId: pick(rand, ct), kind: pick(rand, ['preventative', 'mitigating']) }),
    () => unlinkControl(d, act, { hazardId: pick(rand, hz), controlId: pick(rand, ct) }),
    () => createPlatform(d, act, { name: `Platform ${n()}`, ownerId: act.by }),
    () => retirePlatform(d, act, { id: pick(rand, pl) }),
    () => linkHazard(d, act, { hazardId: pick(rand, hz), platformId: pick(rand, pl) }),
    () => unlinkHazard(d, act, { hazardId: pick(rand, hz), platformId: pick(rand, pl) }),
    () => setReportId(d, act, { hazardId: pick(rand, hz), platformId: pick(rand, pl), reportId: `R-${n()}` }),
    () => confirmControl(d, act, triple()),
    () => excludeControl(d, act, { ...triple(), reason: `Reason ${n()}` }),
    () => resetControl(d, act, triple()),
    () => setRating(d, act, { hazardId: pick(rand, hz), platformId: pick(rand, pl), stage: pick(rand, ['initial', 'residual']), consequence: 1 + Math.floor(rand() * 5), likelihood: pick(rand, [...'ABCDEFG']) }),
  ];
  try {
    return pick(rand, actions)();
  } catch (e) {
    if (e instanceof PivotError) return d;
    throw e;
  }
}
