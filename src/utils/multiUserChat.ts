import type {
  ChatMessage,
  Conversation,
  EncryptedEnvelope,
  StatusAudience,
  StatusTheme,
} from '../types/handrawina';

export const BLUEPRINT_LIMITS = {
  idMax: 128,
  displayNameMax: 80,
  initialsMax: 4,
  emailMax: 160,
  phoneMax: 32,
  aboutMax: 200,
  messagePlaintextMax: 4000,
  ciphertextMax: 8000,
  lastMessagePreviewMax: 300,
  statusTextMax: 500,
  captionTagMax: 48,
  maxParticipants: 10,
  maxIceCandidates: 40,
  maxStatusAudience: 50,
} as const;

export const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

export function sanitizeFirestoreId(raw: string, fallback = 'item'): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, BLUEPRINT_LIMITS.idMax);
  return cleaned.length > 0 ? cleaned : fallback;
}

export function clampStr(raw: string | null | undefined, maxLen: number, fallback = ''): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return fallback.slice(0, maxLen);
  return trimmed.slice(0, maxLen);
}

export function deriveInitials(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return 'HN';
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase().slice(0, 4);
}

/**
 * Computes a deterministic, Firestore-rule-safe direct conversation ID for any pair of users.
 * Ordering UIDs lexicographically ensures User A scanning User B and User B scanning User A
 * always land in the exact same conversation thread.
 */
export function buildDirectConversationId(uidA: string, uidB: string): string {
  const a = sanitizeFirestoreId(uidA, 'u1').slice(0, 48);
  const b = sanitizeFirestoreId(uidB, 'u2').slice(0, 48);
  const [first, second] = [a, b].sort();
  return `dm_${first}_${second}`;
}

export function generateQrTokenCode(mode: 'invite' | 'pair' | 'call'): string {
  const prefix = mode === 'call' ? 'HND-VID' : mode === 'pair' ? 'HND-PAIR' : 'HND-INV';
  const bytes = new Uint8Array(4);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const suffix = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `${prefix}-${suffix}`;
}

export interface FirestoreConversationRecord {
  id: string;
  kind: 'direct' | 'group' | 'business';
  name: string;
  handle: string;
  initials: string;
  creatorUid: string;
  participantIds: string[];
  userAUid: string;
  userAName: string;
  userAInitials: string;
  userAPhone?: string;
  userAFingerprint: string;
  userAPublicKeyX: string;
  userAPublicKeyY: string;
  userBUid: string;
  userBName: string;
  userBInitials: string;
  userBPhone?: string;
  userBFingerprint: string;
  userBPublicKeyX: string;
  userBPublicKeyY: string;
  senderKeyEpoch: number;
  lastMessageText: string;
  lastMessageSenderUid: string;
  lastActiveText: string;
  typingUid: string;
  typingName: string;
  updatedAtMs?: number;
}

export interface ResolvedPeerInfo {
  peerUid: string;
  peerName: string;
  peerInitials: string;
  peerPhone: string;
  peerFingerprint: string;
  peerPublicKeyJwk: JsonWebKey | null;
}

/**
 * Resolves the remote peer's display identity and ECDH public key from the perspective
 * of `currentUid`, so User A sees User B and User B sees User A in the exact same doc.
 */
export function resolvePeerPerspective(
  doc: FirestoreConversationRecord,
  currentUid: string
): ResolvedPeerInfo {
  if (doc.kind !== 'direct') {
    return {
      peerUid: '',
      peerName: doc.name,
      peerInitials: doc.initials,
      peerPhone: '',
      peerFingerprint: doc.userAFingerprint,
      peerPublicKeyJwk: null,
    };
  }

  const iAmUserA = doc.userAUid === currentUid;
  const peerUid = iAmUserA ? doc.userBUid : doc.userAUid;
  const peerName = iAmUserA
    ? doc.userBName || doc.name
    : doc.userAName || doc.name;
  const peerInitials = iAmUserA
    ? doc.userBInitials || deriveInitials(peerName)
    : doc.userAInitials || deriveInitials(peerName);
  const peerPhone = iAmUserA ? doc.userBPhone || '' : doc.userAPhone || '';
  const peerFingerprint = iAmUserA
    ? doc.userBFingerprint || doc.userAFingerprint
    : doc.userAFingerprint || doc.userBFingerprint;
  const x = iAmUserA ? doc.userBPublicKeyX : doc.userAPublicKeyX;
  const y = iAmUserA ? doc.userBPublicKeyY : doc.userAPublicKeyY;

  const peerPublicKeyJwk: JsonWebKey | null =
    x && y
      ? {
          kty: 'EC',
          crv: 'P-256',
          x,
          y,
          ext: true,
        }
      : null;

  return {
    peerUid,
    peerName,
    peerInitials,
    peerPhone,
    peerFingerprint,
    peerPublicKeyJwk,
  };
}

export function mapConversationDocToUi(
  doc: FirestoreConversationRecord,
  currentUid: string,
  unreadCount: number
): Conversation {
  const peer = resolvePeerPerspective(doc, currentUid);
  const isDirect = doc.kind === 'direct';
  return {
    id: doc.id,
    name: isDirect ? peer.peerName : doc.name,
    handle: isDirect
      ? peer.peerUid
        ? `E2EE Terverifikasi · ${peer.peerFingerprint.slice(0, 8).toUpperCase()}`
        : doc.handle
      : doc.handle,
    kind: doc.kind,
    initials: isDirect ? peer.peerInitials : doc.initials,
    unreadCount,
    lastActiveText: doc.lastActiveText || 'Aktif',
    online: true,
    participantCount: Math.max(doc.participantIds.length, isDirect ? 2 : 1),
    senderKeyEpoch: doc.senderKeyEpoch,
    peerPublicKeyFingerprint: peer.peerFingerprint || '0000000000000000',
    labels: isDirect ? ['QR Terhubung'] : ['Grup E2EE'],
  };
}

export interface FirestoreMessageRecord {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderDeviceId: string;
  participantIds: string[];
  kind: ChatMessage['kind'];
  plaintext: string;
  cipherAlgorithm: 'AES-256-GCM';
  cipherProtocol: EncryptedEnvelope['protocol'];
  cipherIvBase64: string;
  ciphertextBase64: string;
  cipherAad: string;
  ratchetStep: number;
  encryptionMode: 'ecdh-p256' | 'room-aes256';
  voiceDurationSec: number;
  mediaLabel: string;
  mediaSizeKb: number;
  status: 'sent' | 'delivered' | 'read';
  timestampLabel: string;
  clientTimestampMs: number;
}

export function sortMessagesChronologically(
  records: FirestoreMessageRecord[]
): FirestoreMessageRecord[] {
  return [...records].sort((a, b) => {
    if (a.clientTimestampMs !== b.clientTimestampMs) {
      return a.clientTimestampMs - b.clientTimestampMs;
    }
    return a.id.localeCompare(b.id);
  });
}

export function mapMessageRecordToUi(
  rec: FirestoreMessageRecord,
  decryptedPlaintext?: string
): ChatMessage {
  return {
    id: rec.id,
    conversationId: rec.conversationId,
    senderId: rec.senderId,
    senderName: rec.senderName,
    senderDeviceId: rec.senderDeviceId,
    kind: rec.kind,
    plaintext: decryptedPlaintext ?? rec.plaintext,
    voiceDurationSec: rec.voiceDurationSec > 0 ? rec.voiceDurationSec : undefined,
    mediaLabel: rec.mediaLabel || undefined,
    mediaSizeKb: rec.mediaSizeKb > 0 ? rec.mediaSizeKb : undefined,
    envelope: rec.ciphertextBase64
      ? {
          algorithm: rec.cipherAlgorithm,
          protocol: rec.cipherProtocol,
          ivBase64: rec.cipherIvBase64,
          ciphertextBase64: rec.ciphertextBase64,
          ratchetStep: rec.ratchetStep,
          aad: rec.cipherAad,
        }
      : undefined,
    timestamp: rec.timestampLabel,
    status: rec.status,
  };
}

export interface SerializedIceCandidates {
  candidateStrings: string[];
  sdpMids: string[];
  sdpMLineIndexes: number[];
}

export function appendIceCandidateBounded(
  current: SerializedIceCandidates,
  candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null }
): SerializedIceCandidates {
  if (!candidate.candidate || current.candidateStrings.length >= BLUEPRINT_LIMITS.maxIceCandidates) {
    return current;
  }
  if (current.candidateStrings.includes(candidate.candidate)) {
    return current;
  }
  return {
    candidateStrings: [...current.candidateStrings, candidate.candidate.slice(0, 2000)],
    sdpMids: [...current.sdpMids, (candidate.sdpMid ?? '').slice(0, 64)],
    sdpMLineIndexes: [...current.sdpMLineIndexes, candidate.sdpMLineIndex ?? 0],
  };
}

export function deserializeIceCandidates(
  bucket: SerializedIceCandidates
): RTCIceCandidateInit[] {
  const count = Math.min(
    bucket.candidateStrings.length,
    bucket.sdpMids.length,
    bucket.sdpMLineIndexes.length,
    BLUEPRINT_LIMITS.maxIceCandidates
  );
  const out: RTCIceCandidateInit[] = [];
  for (let i = 0; i < count; i += 1) {
    const cand = bucket.candidateStrings[i];
    if (!cand) continue;
    out.push({
      candidate: cand,
      sdpMid: bucket.sdpMids[i] || null,
      sdpMLineIndex: bucket.sdpMLineIndexes[i],
    });
  }
  return out;
}

export function buildVisibleUidsForStatus(
  authorUid: string,
  conversations: FirestoreConversationRecord[],
  contactUids: string[] = []
): string[] {
  const set = new Set<string>([sanitizeFirestoreId(authorUid, 'user')]);
  for (const cuid of contactUids) {
    if (cuid && VALID_ID_REGEX.test(cuid) && set.size < BLUEPRINT_LIMITS.maxStatusAudience) {
      set.add(cuid);
    }
  }
  for (const conv of conversations) {
    for (const pid of conv.participantIds) {
      if (pid && VALID_ID_REGEX.test(pid) && set.size < BLUEPRINT_LIMITS.maxStatusAudience) {
        set.add(pid);
      }
    }
  }
  return Array.from(set);
}

export function isValidStatusThemeValue(val: string): val is StatusTheme {
  return val === 'navy' || val === 'champagne' || val === 'orange-light' || val === 'bronze';
}

export function isValidStatusAudienceValue(val: string): val is StatusAudience {
  return val === 'all-contacts' || val === 'close-circle' || val === 'selected-groups';
}
