import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { assignNumbers, retireHazard, deleteHazard } from '../../src/core/ops/hazards.js';
import { createControl, linkControl, linkExistingControl, updateControl } from '../../src/core/ops/controls.js';
import { setControlStatus } from '../../src/core/ops/assessment.js';
import { unlinkHazard } from '../../src/core/ops/platforms.js';
import { DEFAULT_FILTERS, normalizeFilters, needFilters, sameFilters, filterWords, bowtieOf, hazardName } from '../../src/core/bowtie.js';
import { seed, act } from '../helpers.js';

/**
 * seed(): h1 Fire (cf1, cq1, c1 Sprinklers preventative, c2 Fire drills mitigating) on p1 Alpha and p2 Bravo.
 * Here: c1 implemented on p1; c3 Hot-work permit additional preventative, rejected on p1;
 * c4 Fire doors existing preventative (Engineering) on p1; c1 is also an existing preventative control on p1.
 */
function data() {
  let d = seed();
  d = createControl(d, act, { id: 'c3', title: 'Hot-work permit' });
  d = createControl(d, act, { id: 'c4', title: 'Fire doors' });
  d = updateControl(d, act, { id: 'c4', tier: 'Engineering' });
  d = linkControl(d, act, { hazardId: 'h1', controlId: 'c3', kind: 'preventative' });
  d = setControlStatus(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', status: 'implemented' });
  d = setControlStatus(d, act, { hazardId: 'h1', controlId: 'c3', platformId: 'p1', status: 'rejected', reason: 'Not needed' });
  d = linkExistingControl(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c4', kind: 'preventative' });
  d = linkExistingControl(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c1', kind: 'preventative' });
  return assignNumbers(d);
}
const lines = (items) => items.map((i) => `${i.control.id} ${i.line}`);

test('filters: defaults, lenient normalising, strict checking, comparison and words', () => {
  assert.deepEqual(DEFAULT_FILTERS, { set: 'all', statuses: ['recommended', 'planned', 'implemented'] });
  assert.deepEqual(normalizeFilters(null), { set: 'all', statuses: ['recommended', 'planned', 'implemented'] });
  assert.deepEqual(normalizeFilters({ set: 'nope', statuses: ['rejected', 'bogus', 'planned'] }), { set: 'all', statuses: ['planned', 'rejected'] });
  assert.deepEqual(needFilters({ set: 'existing', statuses: [] }), { set: 'existing', statuses: [] });
  assert.throws(() => needFilters({ set: 'nope', statuses: [] }), (e) => e instanceof PivotError && e.code === 'bowtie.filters');
  assert.throws(() => needFilters({ set: 'all', statuses: ['bogus'] }), (e) => e instanceof PivotError && e.code === 'bowtie.filters');
  assert.ok(sameFilters({ set: 'all', statuses: ['planned', 'recommended'] }, { set: 'all', statuses: ['recommended', 'planned'] }));
  assert.ok(!sameFilters({ set: 'all', statuses: [] }, { set: 'existing', statuses: [] }));
  assert.equal(filterWords({ set: 'existing', statuses: ['planned'] }), 'Existing');
  assert.equal(filterWords({ set: 'additional', statuses: ['implemented', 'planned'] }), 'Additional (Planned, Implemented)');
  assert.equal(filterWords({ set: 'all', statuses: [] }), 'Existing + Additional (none)');
});

test('the default view: existing controls first, then additional ones, rejected hidden; causal factors and consequences whole', () => {
  const b = bowtieOf(data(), 'h1', 'p1', DEFAULT_FILTERS);
  assert.equal(b.ok, true);
  assert.equal(b.hazard.id, 'h1');
  assert.equal(b.platform.id, 'p1');
  assert.equal(b.caption, 'Alpha · Existing + Additional (Recommended, Planned, Implemented)');
  assert.deepEqual(b.causalFactors.map((r) => r.text), ['Hot works']);
  assert.deepEqual(b.consequences.map((r) => r.text), ['Burns']);
  assert.deepEqual(lines(b.preventative), ['c4 Existing · Engineering', 'c1 Existing', 'c1 Additional · Implemented']);
  assert.deepEqual(lines(b.mitigating), ['c2 Additional · Recommended']);
  assert.deepEqual(b.preventative.map((i) => i.source), ['existing', 'existing', 'additional']);
});

test('each set and status filter selects exactly its controls', () => {
  const d = data();
  const pick = (filters) => [...lines(bowtieOf(d, 'h1', 'p1', filters).preventative), ...lines(bowtieOf(d, 'h1', 'p1', filters).mitigating)];
  assert.deepEqual(pick({ set: 'existing', statuses: ['rejected'] }), ['c4 Existing · Engineering', 'c1 Existing']);
  assert.deepEqual(pick({ set: 'additional', statuses: ['rejected'] }), ['c3 Additional · Rejected']);
  assert.deepEqual(pick({ set: 'additional', statuses: ['implemented', 'recommended'] }), ['c1 Additional · Implemented', 'c2 Additional · Recommended']);
  assert.deepEqual(pick({ set: 'all', statuses: [] }), ['c4 Existing · Engineering', 'c1 Existing']);
  assert.deepEqual(pick({ set: 'additional', statuses: ['planned'] }), []);
  // Another platform has its own statuses: nothing is ruled on Bravo, so everything is recommended there.
  assert.deepEqual(lines(bowtieOf(d, 'h1', 'p2', { set: 'additional', statuses: ['recommended'] }).preventative), ['c1 Additional · Recommended', 'c3 Additional · Recommended']);
});

test('a diagram that cannot be drawn says why', () => {
  const d = data();
  // A hazard is retired or deleted only once it is off every platform.
  const off = unlinkHazard(unlinkHazard(d, act, { hazardId: 'h1', platformId: 'p1' }), act, { hazardId: 'h1', platformId: 'p2' });
  assert.deepEqual(bowtieOf(d, 'nope', 'p1', DEFAULT_FILTERS), { ok: false, reason: 'hazard-gone', message: 'The hazard in this view has been deleted.' });
  assert.equal(bowtieOf(deleteHazard(off, act, { id: 'h1' }), 'h1', 'p1', DEFAULT_FILTERS).reason, 'hazard-gone');
  const retired = bowtieOf(retireHazard(off, act, { id: 'h1' }), 'h1', 'p1', DEFAULT_FILTERS);
  assert.deepEqual(retired, { ok: false, reason: 'hazard-retired', message: 'H-0001 Fire is retired.' });
  assert.equal(bowtieOf(d, 'h1', 'nope', DEFAULT_FILTERS).reason, 'platform-gone');
  const unlinked = bowtieOf(unlinkHazard(d, act, { hazardId: 'h1', platformId: 'p2' }), 'h1', 'p2', DEFAULT_FILTERS);
  assert.deepEqual(unlinked, { ok: false, reason: 'not-on-platform', message: 'H-0001 Fire is no longer on Bravo.' });
  assert.equal(bowtieOf(d, 'h2', 'p1', DEFAULT_FILTERS).reason, 'not-on-platform');
});

test('a hazard is named by its number and title, or its title alone until numbered', () => {
  assert.equal(hazardName(data().records.hazard.h1), 'H-0001 Fire');
  assert.equal(hazardName(seed().records.hazard.h1), 'Fire');
});
