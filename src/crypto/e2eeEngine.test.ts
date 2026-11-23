import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSafetyNumber,
  decryptCloudBackup,
  decryptE2eePayload,
  deriveSessionAesKey,
  encryptCloudBackup,
  encryptE2eePayload,
  generate64DigitRecoveryKey,
  generateEcdhKeyBundle,
} from './e2eeEngine';

test('ECDH + HKDF + AES-256-GCM round-trip encrypts, decrypts, and rejects tampered ciphertext', async () => {
  const alice = await generateEcdhKeyBundle();
  const bob = await generateEcdhKeyBundle();

  const aliceSessionKey = await deriveSessionAesKey(
    alice.keyPair.privateKey,
    bob.keyPair.publicKey,
    'conv-test'
  );
  const bobSessionKey = await deriveSessionAesKey(
    bob.keyPair.privateKey,
    alice.keyPair.publicKey,
    'conv-test'
  );

  const envelope = await encryptE2eePayload({
    key: aliceSessionKey,
    plaintext: 'Halo Handrawina E2EE rahasia!',
    aad: 'conv-test:alice',
    protocol: 'Signal-DoubleRatchet',
    ratchetStep: 1,
  });

  assert.equal(envelope.algorithm, 'AES-256-GCM');
  assert.notEqual(envelope.ciphertextBase64, 'Halo Handrawina E2EE rahasia!');

  const decrypted = await decryptE2eePayload(bobSessionKey, envelope);
  assert.equal(decrypted, 'Halo Handrawina E2EE rahasia!');

  // Tamper AAD -> must fail authentication
  await assert.rejects(
    () => decryptE2eePayload(bobSessionKey, { ...envelope, aad: 'conv-test:mallory' }),
    /OperationError|unable to authenticate|The operation failed/i
  );
});

test('computeSafetyNumber is symmetric and formatted as 12 groups of 5 digits', async () => {
  const numAB = await computeSafetyNumber('aaaa1111bbbb2222', 'cccc3333dddd4444');
  const numBA = await computeSafetyNumber('cccc3333dddd4444', 'aaaa1111bbbb2222');

  assert.equal(numAB, numBA);
  const groups = numAB.split(' ');
  assert.equal(groups.length, 12);
  for (const g of groups) {
    assert.match(g, /^\d{5}$/);
  }
});

test('cloud backup PBKDF2 + AES-256-GCM round-trip and 64-digit recovery key format', async () => {
  const key64 = generate64DigitRecoveryKey();
  assert.equal(key64.length, 64);
  assert.match(key64, /^[0-9A-F]{64}$/);

  const snapshot = JSON.stringify({ messages: 42, app: 'Handrawina' });
  const encrypted = await encryptCloudBackup(snapshot, 'RahasiaKuat#2026');
  const restored = await decryptCloudBackup(encrypted, 'RahasiaKuat#2026');
  assert.equal(restored, snapshot);

  await assert.rejects(() => decryptCloudBackup(encrypted, 'KataSandiSalah'));
});
