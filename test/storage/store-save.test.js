import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { load, save, FILES } from '../../src/storage/store.js';
import { openEnvelope } from '../../src/storage/envelope.js';
import { fixedClock } from '../../src/core/time.js';
import { createHazard, updateHazard } from '../../src/core/ops/hazards.js';
import { createControl } from '../../src/core/ops/controls.js';
import { unseenOverrides } from '../../src/core/history.js';

const clock = () => fixedClock('2026-09-28T10:00:00+10:00');
const actOf = (by) => ({ by, at: '2026-09-28T10:00:00+10:00' });

/** @param {MemoryFolder} f */
async function open(f) {
  const { data, stamp } = await load(f.handle);
  return { base: data, working: data, loadedStamp: stamp };
}
/** @param {{ base: any }} s @param {any} result */
const after = (result) => ({ base: result.data, working: result.data, loadedStamp: result.stamp });

test('the first save writes data.json, numbers new hazards, and supersedes nothing', async () => {
  const f = new MemoryFolder();
  const s = await open(f);
  s.working = createHazard(s.working, actOf('a'), { id: 'h1', title: 'Fire' });
  const r = await save(f.handle, s, 'a', clock());
  assert.equal(r.merged, false);
  assert.equal(r.supersededFile, null);
  assert.equal(r.data.records.hazard.h1.number, 1);
  assert.equal(r.stamp.savedBy, 'a');
  const opened = await openEnvelope(/** @type {string} */ (f.read(FILES.data)), 'data');
  assert.ok(opened.ok);
  assert.deepEqual(opened.envelope.body, r.data);
  assert.deepEqual(f.list(), ['data.json']);
});

test('two users: both sets of changes are kept, and the older file goes to Superseded Saves', async () => {
  const f = new MemoryFolder();
  let a = await open(f);
  a.working = createHazard(a.working, actOf('a'), { id: 'h1', title: 'Fire' });
  a = after(await save(f.handle, a, 'a', clock()));
  let b = await open(f);

  b.working = createControl(b.working, actOf('b'), { id: 'c1', title: 'Sprinklers' });
  const bResult = await save(f.handle, b, 'b', clock());
  const bText = f.read(FILES.data);

  a.working = updateHazard(a.working, actOf('a'), { id: 'h1', title: 'Big fire' });
  const r = await save(f.handle, a, 'a', clock());
  assert.equal(r.merged, true);
  assert.equal(r.lastSavedBy, 'b');
  assert.deepEqual(r.conflicts, []);
  assert.equal(r.data.records.hazard.h1.title, 'Big fire');
  assert.equal(r.data.records.control.c1.title, 'Sprinklers');
  assert.equal(r.supersededFile, `Superseded Saves/data-20260928-100000-${bResult.stamp.token.slice(0, 8)}.json`);
  assert.equal(f.read(r.supersededFile), bText, 'the superseded copy is the file exactly as b left it');
});

test('a conflict: the current save wins, the saver is told, and the overridden user gets a notice', async () => {
  const f = new MemoryFolder();
  let a = await open(f);
  a.working = createHazard(a.working, actOf('a'), { id: 'h1', title: 'Fire' });
  a = after(await save(f.handle, a, 'a', clock()));
  const b = await open(f);
  b.working = updateHazard(b.working, actOf('b'), { id: 'h1', title: 'B title' });
  await save(f.handle, b, 'b', clock());
  a.working = updateHazard(a.working, actOf('a'), { id: 'h1', title: 'A title' });
  const r = await save(f.handle, a, 'a', clock());
  assert.equal(r.data.records.hazard.h1.title, 'A title');
  assert.deepEqual(r.conflicts.map((c) => `${c.kind}:${c.id}:${c.overriddenBy}`), ['hazard:h1:b']);
  const notices = unseenOverrides((await load(f.handle)).data, 'b');
  assert.equal(notices.length, 1);
  assert.equal(notices[0].items[0].theirs.title, 'B title');
});

test('hazards created by two users at once get different numbers', async () => {
  const f = new MemoryFolder();
  const a = await open(f);
  const b = await open(f);
  a.working = createHazard(a.working, actOf('a'), { id: 'ha', title: 'A' });
  b.working = createHazard(b.working, actOf('b'), { id: 'hb', title: 'B' });
  await save(f.handle, b, 'b', clock());
  const r = await save(f.handle, a, 'a', clock());
  assert.equal(r.data.records.hazard.hb.number, 1);
  assert.equal(r.data.records.hazard.ha.number, 2);
  assert.equal(r.data.nextHazardNumber, 3);
});

test('Review focus 1: another save lands between the merge and the write; the save notices and merges it too', async () => {
  const f = new MemoryFolder();
  let a = await open(f);
  a.working = createHazard(a.working, actOf('a'), { id: 'h1', title: 'Fire' });
  a = after(await save(f.handle, a, 'a', clock()));
  const b = await open(f);
  b.working = createControl(b.working, actOf('b'), { id: 'c-late', title: 'Late control' });
  a.working = updateHazard(a.working, actOf('a'), { id: 'h1', title: 'Big fire' });
  let planted = false;
  const r = await save(f.handle, a, 'a', clock(), {
    beforeWrite: async () => {
      if (planted) return;
      planted = true;
      await save(f.handle, b, 'b', clock());
    },
  });
  assert.equal(r.data.records.control['c-late'].title, 'Late control', 'the late save is merged, not overwritten');
  assert.equal(r.data.records.hazard.h1.title, 'Big fire');
  assert.equal((await load(f.handle)).stamp.token, r.stamp.token);
});

test('Review focus 2: data.json removed after loading does not read as "everything deleted"', async () => {
  const f = new MemoryFolder();
  let a = await open(f);
  a.working = createHazard(a.working, actOf('a'), { id: 'h1', title: 'Fire' });
  a = after(await save(f.handle, a, 'a', clock()));
  f.remove(FILES.data);
  a.working = updateHazard(a.working, actOf('a'), { id: 'h1', title: 'Big fire' });
  const r = await save(f.handle, a, 'a', clock());
  assert.equal(r.merged, false);
  assert.equal(r.data.records.hazard.h1.title, 'Big fire');
  assert.equal((await load(f.handle)).data.records.hazard.h1.title, 'Big fire');
});

test('a failed write leaves data.json exactly as it was', async () => {
  const f = new MemoryFolder();
  let a = await open(f);
  a.working = createHazard(a.working, actOf('a'), { id: 'h1', title: 'Fire' });
  a = after(await save(f.handle, a, 'a', clock()));
  const before = f.read(FILES.data);
  f.failWrite((rel) => rel === FILES.data);
  a.working = updateHazard(a.working, actOf('a'), { id: 'h1', title: 'Big fire' });
  await assert.rejects(() => save(f.handle, a, 'a', clock()), (e) => e.code === 'write-failed');
  assert.equal(f.read(FILES.data), before);
});

test('a data.json damaged on disk stops the save with nothing written', async () => {
  const f = new MemoryFolder();
  let a = await open(f);
  a = after(await save(f.handle, a, 'a', clock()));
  f.write(FILES.data, /** @type {string} */ (f.read(FILES.data)).replace('"nextHazardNumber": 1', '"nextHazardNumber": 9'));
  const damaged = f.read(FILES.data);
  await assert.rejects(() => save(f.handle, a, 'a', clock()), (e) => e.code === 'data.unreadable');
  assert.equal(f.read(FILES.data), damaged);
});
