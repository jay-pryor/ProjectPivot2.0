import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fault_point, arm, disarm_all, armed_points, InjectedFault } from '../faults.js';

test('an unarmed fault point does nothing', () => {
  assert.doesNotThrow(() => fault_point('store.save.commit'));
  assert.deepEqual(armed_points(), []);
});

test('an armed fault point throws InjectedFault naming itself, until disarmed', () => {
  arm('store.save.commit');
  try {
    assert.deepEqual(armed_points(), ['store.save.commit']);
    assert.throws(() => fault_point('store.save.commit'), (e) => e instanceof InjectedFault && e.faultPoint === 'store.save.commit');
    assert.doesNotThrow(() => fault_point('store.save.other'));
  } finally {
    disarm_all();
  }
  assert.doesNotThrow(() => fault_point('store.save.commit'));
});

test('a test may arm its own error', () => {
  const mine = new Error('disk full');
  arm('store.save.write', mine);
  try {
    assert.throws(() => fault_point('store.save.write'), (e) => e === mine);
  } finally {
    disarm_all();
  }
});
