import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { assignNumbers, retireHazard, deleteHazard } from '../../src/core/ops/hazards.js';
import { createControl, linkControl, addControlHere, updateControl } from '../../src/core/ops/controls.js';
import { setControlStatus } from '../../src/core/ops/assessment.js';
import { unlinkHazard } from '../../src/core/ops/platforms.js';
import { DEFAULT_FILTERS, normalizeFilters, needFilters, sameFilters, filterWords, bowtieOf, hazardName } from '../../src/core/bowtie.js';
import { seed, act } from '../helpers.js';

/**
 * seed(): h1 Fire (cf1, cq1, c1 Sprinklers preventative, c2 Fire drills mitigating) on p1 Alpha and p2 Bravo.
 * Here: c1 implemented on p1; c3 Hot-work permit preventative, rejected on p1;
 * c4 Fire doors preventative (Engineering), added on p1 alone and implemented there.
 */
function data() {
  let d = seed();
  d = createControl(d, act, { id: 'c3', title: 'Hot-work permit' });
  d = createControl(d, act, { id: 'c4', title: 'Fire doors' });
  d = updateControl(d, act, { id: 'c4', tier: 'Engineering' });
  d = linkControl(d, act, { hazardId: 'h1', controlId: 'c3', kind: 'preventative' });
  d = setControlStatus(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', status: 'implemented' });
  d = setControlStatus(d, act, { hazardId: 'h1', controlId: 'c3', platformId: 'p1', status: 'rejected', reason: 'Not needed' });
  d = addControlHere(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c4', kind: 'preventative' });
  d = setControlStatus(d, act, { hazardId: 'h1', controlId: 'c4', platformId: 'p1', status: 'implemented' });
  return assignNumbers(d);
}
const lines = (items) => items.map((i) => `${i.control.id} ${i.tags.map((t) => t.text).join(' · ')}`.trim());

test('filters: defaults, lenient normalising, strict checking, comparison and words', () => {
  assert.deepEqual(DEFAULT_FILTERS, { statuses: ['recommended', 'planned', 'implemented'] });
  assert.deepEqual(normalizeFilters(null), { statuses: ['recommended', 'planned', 'implemented'] });
  assert.deepEqual(normalizeFilters({ statuses: ['rejected', 'bogus', 'planned'] }), { statuses: ['planned', 'rejected'] });
  assert.deepEqual(normalizeFilters({ set: 'existing', statuses: ['implemented'] }), { statuses: ['implemented'] }, 'a view saved with existing or additional drops it');
  assert.deepEqual(needFilters({ statuses: [] }), { statuses: [] });
  assert.throws(() => needFilters({ statuses: 'planned' }), (e) => e instanceof PivotError && e.code === 'bowtie.filters');
  assert.throws(() => needFilters({ statuses: ['bogus'] }), (e) => e instanceof PivotError && e.code === 'bowtie.filters');
  assert.ok(sameFilters({ statuses: ['planned', 'recommended'] }, { statuses: ['recommended', 'planned'] }));
  assert.ok(sameFilters({ set: 'all', statuses: [] }, { set: 'existing', statuses: [] }), 'the old set no longer counts');
  assert.ok(!sameFilters({ statuses: [] }, { statuses: ['planned'] }));
  assert.equal(filterWords({ statuses: ['implemented', 'planned'] }), 'Planned, Implemented');
  assert.equal(filterWords({ statuses: [] }), 'No controls');
});

test('the default view: every control but the rejected, by tier, each with its status; causal factors and consequences whole', () => {
  const b = bowtieOf(data(), 'h1', 'p1', DEFAULT_FILTERS);
  assert.equal(b.ok, true);
  assert.equal(b.hazard.id, 'h1');
  assert.equal(b.platform.id, 'p1');
  assert.equal(b.caption, 'Alpha · Recommended, Planned, Implemented');
  assert.deepEqual(b.causalFactors.map((r) => r.text), ['Hot works']);
  assert.deepEqual(b.consequences.map((r) => r.text), ['Burns']);
  assert.deepEqual(lines(b.preventative), ['c4 Implemented · Engineering', 'c1 Implemented']);
  assert.deepEqual(lines(b.mitigating), ['c2 Recommended']);
  assert.deepEqual(b.preventative.map((i) => i.state), ['implemented', 'implemented']);
  assert.deepEqual(b.preventative.map((i) => i.tags.map((t) => t.tone)), [['implemented', 'tier'], ['implemented']], 'each tag has its colour');
});

test('each status filter selects exactly its controls; a control taken off a platform is not drawn there', () => {
  const d = data();
  const pick = (filters, p = 'p1') => [...lines(bowtieOf(d, 'h1', p, filters).preventative), ...lines(bowtieOf(d, 'h1', p, filters).mitigating)];
  assert.deepEqual(pick({ statuses: ['rejected'] }), ['c3 Rejected']);
  assert.deepEqual(pick({ statuses: ['implemented', 'recommended'] }), ['c4 Implemented · Engineering', 'c1 Implemented', 'c2 Recommended']);
  assert.deepEqual(pick({ statuses: [] }), []);
  assert.deepEqual(pick({ statuses: ['planned'] }), []);
  // Another platform has its own statuses: nothing is ruled on Bravo, and Fire doors was added on Alpha alone.
  assert.deepEqual(pick({ statuses: ['recommended'] }, 'p2'), ['c1 Recommended', 'c3 Recommended', 'c2 Recommended']);
});

test('a diagram that cannot be drawn says why', () => {
  const d = data();
  // A hazard is retired or deleted only once it is off every platform.
  const off = unlinkHazard(unlinkHazard(d, act, { hazardId: 'h1', platformId: 'p1' }), act, { hazardId: 'h1', platformId: 'p2' });
  assert.deepEqual(bowtieOf(d, 'nope', 'p1', DEFAULT_FILTERS), { ok: false, reason: 'hazard-gone', message: 'The hazard in this view has been deleted.' });
  assert.equal(bowtieOf(deleteHazard(off, act, { id: 'h1' }), 'h1', 'p1', DEFAULT_FILTERS).reason, 'hazard-gone');
  const retired = bowtieOf(retireHazard(off, act, { id: 'h1' }), 'h1', 'p1', DEFAULT_FILTERS);
  assert.deepEqual(retired, { ok: false, reason: 'hazard-retired', message: 'HAZ-001 Fire is retired.' });
  assert.equal(bowtieOf(d, 'h1', 'nope', DEFAULT_FILTERS).reason, 'platform-gone');
  const unlinked = bowtieOf(unlinkHazard(d, act, { hazardId: 'h1', platformId: 'p2' }), 'h1', 'p2', DEFAULT_FILTERS);
  assert.deepEqual(unlinked, { ok: false, reason: 'not-on-platform', message: 'HAZ-001 Fire is no longer on Bravo.' });
  assert.equal(bowtieOf(d, 'h2', 'p1', DEFAULT_FILTERS).reason, 'not-on-platform');
});

test('a hazard is named by its number and title, or its title alone until numbered', () => {
  assert.equal(hazardName(data().records.hazard.h1), 'HAZ-001 Fire');
  assert.equal(hazardName(seed().records.hazard.h1), 'Fire');
});
