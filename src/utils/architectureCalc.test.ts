import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateGroupFanoutMetrics,
  clampHandshakeStep,
  getHandshakeScenario,
  HANDSHAKE_SCENARIOS,
} from './architectureCalc';

test('calculateGroupFanoutMetrics computes exact O(1) vs O(N*D) savings for 1500 participants', () => {
  const result = calculateGroupFanoutMetrics({
    participants: 1500,
    avgDevicesPerUser: 2,
    messageSizeKb: 4,
  });

  // 1500 * 2 - 1 (sender's active device) = 2999 recipient devices
  assert.equal(result.totalRecipientDevices, 2999);
  assert.equal(result.pairwiseEncryptions, 2999);
  assert.equal(result.senderKeyEncryptions, 1);
  assert.ok(result.encryptionReductionPct > 99.9);
  assert.ok(result.pairwiseClientUploadKb > 12000);
  assert.equal(result.senderKeyClientUploadKb, 4.25);
  assert.ok(result.bandwidthSavingsFactor > 2500);
  assert.equal(result.rotationSkdmMessages, 2999);
});

test('calculateGroupFanoutMetrics clamps out-of-range inputs safely', () => {
  const low = calculateGroupFanoutMetrics({
    participants: 0,
    avgDevicesPerUser: 0,
    messageSizeKb: -5,
  });
  assert.equal(low.participants, 2);
  assert.equal(low.avgDevicesPerUser, 1);
  assert.equal(low.messageSizeKb, 1);
  assert.equal(low.totalRecipientDevices, 1);

  const high = calculateGroupFanoutMetrics({
    participants: 9999,
    avgDevicesPerUser: 12,
    messageSizeKb: 1000,
  });
  assert.equal(high.participants, 1500);
  assert.equal(high.avgDevicesPerUser, 5);
  assert.equal(high.messageSizeKb, 512);
});

test('handshake scenarios enforce zero-knowledge server invariant and safe step clamping', () => {
  assert.equal(HANDSHAKE_SCENARIOS.length, 3);

  for (const scenario of HANDSHAKE_SCENARIOS) {
    assert.ok(scenario.steps.length >= 3, `Scenario ${scenario.id} should have at least 3 steps`);
    assert.equal(clampHandshakeStep(scenario, -10), 0);
    assert.equal(clampHandshakeStep(scenario, 999), scenario.steps.length - 1);

    // Server must never hold a 'private' key in any step
    for (const step of scenario.steps) {
      const serverPrivateItems = step.server.items.filter((i) => i.sensitivity === 'private');
      assert.equal(
        serverPrivateItems.length,
        0,
        `Zero-knowledge violation in ${scenario.id} step ${step.stepNumber}`
      );
    }
  }

  const x3dh = getHandshakeScenario('x3dh-ratchet');
  assert.equal(x3dh.id, 'x3dh-ratchet');
  assert.equal(x3dh.steps.length, 6);
});
