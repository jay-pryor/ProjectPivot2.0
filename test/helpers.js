import { emptyData } from '../src/core/data.js';
import { createHazard, addCausalFactor, addConsequence } from '../src/core/ops/hazards.js';
import { createControl, linkControl } from '../src/core/ops/controls.js';
import { createPlatform, linkHazard } from '../src/core/ops/platforms.js';

export const act = { by: 'u1', at: '2026-09-28T10:00:00+10:00' };
export const later = { by: 'u2', at: '2026-09-28T11:00:00+10:00' };

/** h1 Fire (cf1, cq1, c1 preventative, c2 mitigating) on p1 Alpha and p2 Bravo; h2 Flood on nothing. */
export function seed() {
  let d = emptyData();
  d = createHazard(d, act, { id: 'h1', title: 'Fire' });
  d = createHazard(d, act, { id: 'h2', title: 'Flood' });
  d = addCausalFactor(d, act, { id: 'cf1', hazardId: 'h1', text: 'Hot works' });
  d = addConsequence(d, act, { id: 'cq1', hazardId: 'h1', text: 'Burns' });
  d = createControl(d, act, { id: 'c1', title: 'Sprinklers' });
  d = createControl(d, act, { id: 'c2', title: 'Fire drills' });
  d = linkControl(d, act, { hazardId: 'h1', controlId: 'c1', kind: 'preventative' });
  d = linkControl(d, act, { hazardId: 'h1', controlId: 'c2', kind: 'mitigating' });
  d = createPlatform(d, act, { id: 'p1', name: 'Alpha', ownerId: 'u1' });
  d = createPlatform(d, act, { id: 'p2', name: 'Bravo', ownerId: 'u2' });
  d = linkHazard(d, act, { hazardId: 'h1', platformId: 'p1' });
  d = linkHazard(d, act, { hazardId: 'h1', platformId: 'p2' });
  return d;
}
