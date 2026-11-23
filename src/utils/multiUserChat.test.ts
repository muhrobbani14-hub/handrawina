import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendIceCandidateBounded,
  BLUEPRINT_LIMITS,
  buildDirectConversationId,
  buildVisibleUidsForStatus,
  deriveInitials,
  deserializeIceCandidates,
  generateQrTokenCode,
  mapConversationDocToUi,
  resolvePeerPerspective,
  sortMessagesChronologically,
  type FirestoreConversationRecord,
  type FirestoreMessageRecord,
} from './multiUserChat';
import {
  computeSafetyNumber,
  decryptE2eePayload,
  deriveSessionAesKey,
  encryptE2eePayload,
  generateEcdhKeyBundle,
} from '../crypto/e2eeEngine';

test('buildDirectConversationId is symmetric regardless of scan direction', () => {
  const idAB = buildDirectConversationId('user_alpha_1', 'user_beta_2');
  const idBA = buildDirectConversationId('user_beta_2', 'user_alpha_1');
  assert.equal(idAB, idBA);
  assert.equal(idAB, 'dm_user_alpha_1_user_beta_2');
});

test('generateQrTokenCode produces valid Handrawina prefix formats', () => {
  assert.match(generateQrTokenCode('invite'), /^HND-INV-[A-F0-9]{8}$/);
  assert.match(generateQrTokenCode('pair'), /^HND-PAIR-[A-F0-9]{8}$/);
  assert.match(generateQrTokenCode('call'), /^HND-VID-[A-F0-9]{8}$/);
});

test('resolvePeerPerspective swaps visible peer identity cleanly between User A and User B', () => {
  const conv: FirestoreConversationRecord = {
    id: 'dm_uidA_uidB',
    kind: 'direct',
    name: 'Obrolan Langsung',
    handle: 'Handrawina E2EE',
    initials: 'OL',
    creatorUid: 'uidB',
    participantIds: ['uidA', 'uidB'],
    userAUid: 'uidA',
    userAName: 'Achmad Umam',
    userAInitials: 'AU',
    userAFingerprint: '11112222333344445555666677778888',
    userAPublicKeyX: 'pubX_A',
    userAPublicKeyY: 'pubY_A',
    userBUid: 'uidB',
    userBName: 'Siti Rahma',
    userBInitials: 'SR',
    userBFingerprint: 'aaaabbbbccccddddeeeeffff00001111',
    userBPublicKeyX: 'pubX_B',
    userBPublicKeyY: 'pubY_B',
    senderKeyEpoch: 1,
    lastMessageText: 'Halo!',
    lastMessageSenderUid: 'uidA',
    lastActiveText: 'Baru saja',
    typingUid: '',
    typingName: '',
  };

  const viewForA = mapConversationDocToUi(conv, 'uidA', 0);
  const viewForB = mapConversationDocToUi(conv, 'uidB', 2);

  assert.equal(viewForA.name, 'Siti Rahma');
  assert.equal(viewForA.initials, 'SR');
  assert.equal(viewForA.peerPublicKeyFingerprint, conv.userBFingerprint);

  assert.equal(viewForB.name, 'Achmad Umam');
  assert.equal(viewForB.initials, 'AU');
  assert.equal(viewForB.peerPublicKeyFingerprint, conv.userAFingerprint);
  assert.equal(viewForB.unreadCount, 2);

  const peerForA = resolvePeerPerspective(conv, 'uidA');
  assert.equal(peerForA.peerPublicKeyJwk?.x, 'pubX_B');
  assert.equal(peerForA.peerPublicKeyJwk?.y, 'pubY_B');
});

test('Real ECDH P-256 cross-user encryption, decryption, and Safety Number symmetry', async () => {
  const alice = await generateEcdhKeyBundle();
  const bob = await generateEcdhKeyBundle();

  const aliceSharedKey = await deriveSessionAesKey(
    alice.keyPair.privateKey,
    bob.keyPair.publicKey,
    'dm_alice_bob'
  );
  const bobSharedKey = await deriveSessionAesKey(
    bob.keyPair.privateKey,
    alice.keyPair.publicKey,
    'dm_alice_bob'
  );

  const secretMessage = 'Halo Bob! Pesan ini dienkripsi ECDH P-256 + AES-256-GCM.';
  const envelope = await encryptE2eePayload({
    key: aliceSharedKey,
    plaintext: secretMessage,
    aad: 'dm_alice_bob:epoch-1',
    protocol: 'Signal-DoubleRatchet',
    ratchetStep: 1,
  });

  const decryptedByBob = await decryptE2eePayload(bobSharedKey, envelope);
  assert.equal(decryptedByBob, secretMessage);

  const safetyA = await computeSafetyNumber(alice.fingerprintHex, bob.fingerprintHex);
  const safetyB = await computeSafetyNumber(bob.fingerprintHex, alice.fingerprintHex);
  assert.equal(safetyA, safetyB);
});

test('sortMessagesChronologically orders by timestamp and breaks ties deterministically', () => {
  const base: Omit<FirestoreMessageRecord, 'id' | 'clientTimestampMs'> = {
    conversationId: 'dm_a_b',
    senderId: 'uidA',
    senderName: 'Alice',
    senderDeviceId: 'dev1',
    participantIds: ['uidA', 'uidB'],
    kind: 'text',
    plaintext: 'hi',
    cipherAlgorithm: 'AES-256-GCM',
    cipherProtocol: 'Signal-DoubleRatchet',
    cipherIvBase64: '',
    ciphertextBase64: '',
    cipherAad: '',
    ratchetStep: 1,
    encryptionMode: 'ecdh-p256',
    voiceDurationSec: 0,
    mediaLabel: '',
    mediaSizeKb: 0,
    status: 'sent',
    timestampLabel: '10:00',
  };
  const sorted = sortMessagesChronologically([
    { ...base, id: 'm3', clientTimestampMs: 300 },
    { ...base, id: 'm2', clientTimestampMs: 200 },
    { ...base, id: 'm1', clientTimestampMs: 200 },
  ]);
  assert.deepEqual(
    sorted.map((m) => m.id),
    ['m1', 'm2', 'm3']
  );
});

test('appendIceCandidateBounded deduplicates and enforces maxIceCandidates bound', () => {
  let bucket = { candidateStrings: [] as string[], sdpMids: [] as string[], sdpMLineIndexes: [] as number[] };
  for (let i = 0; i < BLUEPRINT_LIMITS.maxIceCandidates + 10; i += 1) {
    bucket = appendIceCandidateBounded(bucket, {
      candidate: `candidate:${i} 1 udp 1234 1.2.3.4 5000 typ host`,
      sdpMid: '0',
      sdpMLineIndex: 0,
    });
  }
  assert.equal(bucket.candidateStrings.length, BLUEPRINT_LIMITS.maxIceCandidates);
  const decoded = deserializeIceCandidates(bucket);
  assert.equal(decoded.length, BLUEPRINT_LIMITS.maxIceCandidates);
  assert.equal(decoded[0].sdpMid, '0');
});

test('buildVisibleUidsForStatus gathers author and connected peer UIDs without duplicates', () => {
  const uids = buildVisibleUidsForStatus('uidA', [
    {
      id: 'dm_uidA_uidB',
      kind: 'direct',
      name: 'B',
      handle: 'B',
      initials: 'BB',
      creatorUid: 'uidA',
      participantIds: ['uidA', 'uidB'],
      userAUid: 'uidA',
      userAName: 'A',
      userAInitials: 'AA',
      userAFingerprint: '1111222233334444',
      userAPublicKeyX: '',
      userAPublicKeyY: '',
      userBUid: 'uidB',
      userBName: 'B',
      userBInitials: 'BB',
      userBFingerprint: '5555666677778888',
      userBPublicKeyX: '',
      userBPublicKeyY: '',
      senderKeyEpoch: 1,
      lastMessageText: '',
      lastMessageSenderUid: '',
      lastActiveText: '',
      typingUid: '',
      typingName: '',
    },
  ]);
  assert.deepEqual(uids, ['uidA', 'uidB']);
  assert.equal(deriveInitials('Achmad Khotibul Umam'), 'AK');
});
