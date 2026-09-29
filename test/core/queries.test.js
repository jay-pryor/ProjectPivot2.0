import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  controlState, ratingOf, bandOf, hazardDetail, platformHazards, controlUsage, hazardsNotOn, listHazards,
  filterHazards, filterControls,
} from '../../src/core/queries.js';
import { assignHazardNumbers, retireHazard, createHazard } from '../../src/core/ops/hazards.js';
import { confirmControl, excludeControl, setRating } from '../../src/core/ops/assessment.js';
import { setReportId } from '../../src/core/ops/platforms.js';
import { act, seed } from '../helpers.js';

function assessed() {
  let d = assignHazardNumbers(seed());
  d = confirmControl(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1' });
  d = excludeControl(d, act, { hazardId: 'h1', controlId: 'c2', platformId: 'p1', reason: 'No crew' });
  d = setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', consequence: 2, likelihood: 'C' });
  d = setRating(d, act, { hazardId: 'h1', platformId: 'p2', stage: 'residual', consequence: 4, likelihood: 'D' });
  return d;
}

test('controlState: confirmed, excluded, or awaiting', () => {
  const d = assessed();
  assert.equal(controlState(d, 'h1', 'c1', 'p1').state, 'implemented');
  assert.equal(controlState(d, 'h1', 'c2', 'p1').state, 'rejected');
  assert.equal(controlState(d, 'h1', 'c2', 'p1').ruling.reason, 'No crew');
  assert.deepEqual(controlState(d, 'h1', 'c1', 'p2'), { state: 'recommended', ruling: null });
});

test('ratingOf and bandOf', () => {
  const d = assessed();
  assert.deepEqual(ratingOf(d, 'h1', 'p1'), { initial: null, residual: { consequence: 2, likelihood: 'C' } });
  assert.equal(bandOf(ratingOf(d, 'h1', 'p1').residual), 'Serious');
  assert.equal(bandOf(null), 'Uncategorised');
  assert.deepEqual(ratingOf(d, 'h2', 'p1'), { initial: null, residual: null });
});

test('hazardDetail gathers a hazard and what hangs off it', () => {
  const d = setReportId(assessed(), act, { hazardId: 'h1', platformId: 'p2', reportId: 'B-1' });
  const det = hazardDetail(d, 'h1');
  assert.equal(det.hazard.title, 'Fire');
  assert.deepEqual(det.causalFactors.map((r) => r.text), ['Hot works']);
  assert.deepEqual(det.consequences.map((r) => r.text), ['Burns']);
  assert.deepEqual(det.controls.map((c) => `${c.control.title}:${c.link.kind}`), ['Sprinklers:preventative', 'Fire drills:mitigating']);
  assert.deepEqual(det.platforms.map((p) => `${p.platform.name}:${p.reportId}`), ['Alpha:H-0001', 'Bravo:B-1']);
  assert.equal(hazardDetail(d, 'nope'), null);
});

test('platformHazards is the one list of a platform\'s hazards, with ratings and control states', () => {
  const rows = platformHazards(assessed(), 'p1');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].hazard.id, 'h1');
  assert.equal(rows[0].reportId, 'H-0001');
  assert.deepEqual(rows[0].rating.residual, { consequence: 2, likelihood: 'C' });
  assert.deepEqual(rows[0].controls.map((c) => `${c.control.title}:${c.kind}:${c.state}`), ['Sprinklers:preventative:implemented', 'Fire drills:mitigating:rejected']);
});

test('controlUsage shows where a control is used and its state on each platform', () => {
  const u = controlUsage(assessed(), 'c1');
  assert.equal(u.length, 1);
  assert.equal(u[0].hazard.id, 'h1');
  assert.deepEqual(u[0].platforms.map((p) => `${p.platform.name}:${p.state}`), ['Alpha:implemented', 'Bravo:recommended']);
});

test('hazardsNotOn and listHazards', () => {
  const d = assessed();
  assert.deepEqual(hazardsNotOn(d, 'p1').map((h) => h.id), ['h2']);
  const d2 = retireHazard(d, act, { id: 'h2' });
  assert.deepEqual(listHazards(d2, 'live').map((h) => h.id), ['h1']);
  assert.deepEqual(listHazards(d2, 'retired').map((h) => h.id), ['h2']);
  assert.deepEqual(listHazards(d2, 'any').map((h) => h.id), ['h1', 'h2']);
});

test('filterHazards: by platform, band and status, singly and together; a subset of the unfiltered list', () => {
  let d = createHazard(assessed(), act, { id: 'h3', title: 'Wind' });
  const allRows = filterHazards(d, {});
  assert.deepEqual(allRows.map((r) => `${r.hazard.id}@${r.platform?.id ?? '-'}`), ['h1@p1', 'h1@p2', 'h2@-', 'h3@-']);
  assert.deepEqual(filterHazards(d, { platformId: 'p2' }).map((r) => r.hazard.id), ['h1']);
  assert.deepEqual(filterHazards(d, { band: 'Serious' }).map((r) => r.platform.id), ['p1']);
  assert.deepEqual(filterHazards(d, { band: 'Serious', platformId: 'p2' }), []);
  d = retireHazard(d, act, { id: 'h3' });
  assert.deepEqual(filterHazards(d, { status: 'retired' }).map((r) => r.hazard.id), ['h3']);
});

test('filterControls: by platform, band, status and control state', () => {
  const d = assessed();
  const rows = filterControls(d, {});
  assert.deepEqual(rows.map((r) => `${r.control.id}@${r.platform.id}:${r.state}`), ['c1@p1:implemented', 'c1@p2:recommended', 'c2@p1:rejected', 'c2@p2:recommended']);
  assert.deepEqual(filterControls(d, { controlState: 'recommended' }).map((r) => r.platform.id), ['p2', 'p2']);
  assert.deepEqual(filterControls(d, { platformId: 'p1', controlState: 'rejected' }).map((r) => r.control.id), ['c2']);
  assert.deepEqual(filterControls(d, { band: 'Low' }).map((r) => r.control.id), ['c1', 'c2']);
});

test('hazardRows: one row per hazard, of any status, with each platform it is on and its residual band there', async () => {
  const { hazardRows } = await import('../../src/core/queries.js');
  const rows = hazardRows(assessed());
  assert.deepEqual(rows.map((r) => r.hazard.id), ['h1', 'h2']);
  assert.deepEqual(rows[0].platforms.map((p) => `${p.platform.name}:${p.band}`), ['Alpha:Serious', 'Bravo:Low']);
  assert.equal(rows[0].worst, 'Serious');
  assert.deepEqual(rows[1].platforms, []);
  assert.equal(rows[1].worst, null);
});
