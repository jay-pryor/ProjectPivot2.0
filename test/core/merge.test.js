import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS } from '../../src/core/data.js';
import { sameJson } from '../../src/core/json.js';
import { mergeData } from '../../src/core/merge.js';
import { checkRules } from '../../src/core/rules.js';
import { updateHazard, retireHazard, createHazard, assignHazardNumbers } from '../../src/core/ops/hazards.js';
import { updateControl } from '../../src/core/ops/controls.js';
import { linkHazard } from '../../src/core/ops/platforms.js';
import { seed } from '../helpers.js';
import { prng, randomEdit } from './random-edits.js';

const me = { by: 'me', at: '2026-09-28T12:00:00+10:00' };
const them = { by: 'them', at: '2026-09-28T12:30:00+10:00' };
const saveAct = { by: 'me', at: '2026-09-28T13:00:00+10:00' };

test('changes to different records are all kept, with no conflict', () => {
  const base = assignHazardNumbers(seed());
  const mine = updateHazard(base, me, { id: 'h1', title: 'Mine' });
  const theirs = updateControl(base, them, { id: 'c1', title: 'Theirs' });
  const { data, conflicts } = mergeData(base, mine, theirs, saveAct);
  assert.equal(data.records.hazard.h1.title, 'Mine');
  assert.equal(data.records.control.c1.title, 'Theirs');
  assert.deepEqual(conflicts, []);
});

test('the same record changed by both: mine wins, and the conflict names whose edit lost', () => {
  const base = assignHazardNumbers(seed());
  const mine = updateHazard(base, me, { id: 'h1', title: 'Mine' });
  const theirs = updateHazard(base, them, { id: 'h1', title: 'Theirs' });
  const { data, conflicts } = mergeData(base, mine, theirs, saveAct);
  assert.equal(data.records.hazard.h1.title, 'Mine');
  assert.equal(conflicts.length, 1);
  assert.deepEqual({ ...conflicts[0], mine: undefined, theirs: undefined }, { kind: 'hazard', id: 'h1', reason: 'both-changed', overriddenBy: 'them', mine: undefined, theirs: undefined });
  assert.equal(conflicts[0].theirs.title, 'Theirs');
});

test('the same change made by both is not a conflict', () => {
  const base = assignHazardNumbers(seed());
  const mine = updateHazard(base, me, { id: 'h1', title: 'Same' });
  const theirs = updateHazard(base, { ...me, by: 'me' }, { id: 'h1', title: 'Same' });
  assert.deepEqual(mergeData(base, mine, theirs, saveAct).conflicts, []);
});

test('changes that break a rule together: mine wins, and their record is marked deleted', () => {
  const base = assignHazardNumbers(seed());
  const mine = retireHazard(base, me, { id: 'h2' });
  const theirs = linkHazard(base, them, { hazardId: 'h2', platformId: 'p1' });
  const { data, conflicts } = mergeData(base, mine, theirs, saveAct);
  assert.equal(data.records.hazard.h2.status, 'retired');
  assert.equal(data.records.hazardPlatform['hp:h2:p1'].status, 'deleted');
  assert.deepEqual(checkRules(data), []);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].reason, 'rule:hazard-not-live-on-platform');
  assert.equal(conflicts[0].kind, 'hazardPlatform');
  assert.equal(conflicts[0].overriddenBy, 'them');
});

test('history is the union of both sides; the hazard counter takes the larger', () => {
  const base = assignHazardNumbers(seed());
  const mine = createHazard(base, me, { id: 'mine-h', title: 'Mine' });
  const theirs = assignHazardNumbers(createHazard(base, them, { id: 'their-h', title: 'Theirs' }));
  const { data } = mergeData(base, mine, theirs, saveAct);
  for (const id of [...Object.keys(mine.history), ...Object.keys(theirs.history)]) assert.ok(data.history[id]);
  assert.equal(data.nextHazardNumber, theirs.nextHazardNumber);
  const numbered = assignHazardNumbers(data);
  assert.equal(numbered.records.hazard['their-h'].number, 3);
  assert.equal(numbered.records.hazard['mine-h'].number, 4);
});

test('the report design merges as one value', () => {
  const base = seed();
  const mine = { ...base, reportDesign: { a: 1 } };
  const theirs = { ...base, reportDesign: { b: 2 } };
  const { data, conflicts } = mergeData(base, mine, theirs, saveAct);
  assert.deepEqual(data.reportDesign, { a: 1 });
  assert.deepEqual(conflicts.map((c) => c.kind), ['reportDesign']);
  assert.deepEqual(mergeData(base, base, theirs, saveAct).data.reportDesign, { b: 2 });
});

test('random edits on both sides: the rules hold, one-sided changes survive, conflicts resolve to mine, numbers never repeat', () => {
  for (let s = 1; s <= 150; s++) {
    const rand = prng(s);
    let base = seed();
    for (let i = 0; i < 20; i++) base = randomEdit(base, rand, { by: 'setup', at: '2026-09-28T11:00:00+10:00' });
    base = assignHazardNumbers(base);
    let mine = base;
    for (let i = 0; i < 12; i++) mine = randomEdit(mine, rand, me);
    let theirs = base;
    for (let i = 0; i < 12; i++) theirs = randomEdit(theirs, rand, them);
    theirs = assignHazardNumbers(theirs);

    const { data, conflicts } = mergeData(base, mine, theirs, saveAct);
    assert.deepEqual(checkRules(data), [], `seed ${s}: rules`);
    // A completed review is kept whichever side completed it: those conflicts may resolve to theirs.
    const sealed = new Set(conflicts.filter((c) => c.reason === 'review-completed').map((c) => `${c.kind}:${c.id}`));
    const conflicted = new Set(conflicts.map((c) => `${c.kind}:${c.id}`));
    for (const kind of KINDS) {
      const ids = new Set([...Object.keys(base.records[kind]), ...Object.keys(mine.records[kind]), ...Object.keys(theirs.records[kind])]);
      for (const id of ids) {
        const b = base.records[kind][id]; const m = mine.records[kind][id]; const t = theirs.records[kind][id]; const r = data.records[kind][id];
        if (sealed.has(`${kind}:${id}`)) {
          assert.ok(sameJson(r, m) || sameJson(r, t) || r.status === 'deleted', `seed ${s}: ${kind} ${id} takes the completed side`);
          if (kind === 'review') assert.equal(r.state, 'completed', `seed ${s}: review ${id} stays completed`);
        } else if (conflicted.has(`${kind}:${id}`)) {
          assert.ok(sameJson(r, m) || (!m && r.status === 'deleted'), `seed ${s}: ${kind} ${id} resolves to mine`);
        } else if (sameJson(b, m)) {
          assert.ok(sameJson(r, t), `seed ${s}: ${kind} ${id} takes theirs`);
        } else {
          assert.ok(sameJson(r, m), `seed ${s}: ${kind} ${id} takes mine`);
        }
      }
    }
    for (const id of [...Object.keys(mine.history), ...Object.keys(theirs.history)]) assert.ok(data.history[id], `seed ${s}: history kept`);
    const numbers = Object.values(assignHazardNumbers(data).records.hazard).map((h) => h.number).filter((x) => x != null);
    assert.equal(new Set(numbers).size, numbers.length, `seed ${s}: no hazard number repeats`);
  }
});
