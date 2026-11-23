import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  AppSettings,
  CallRecord,
  ChatMessage,
  ConversationKind,
  PairedDevice,
  StatusAudience,
  StatusTheme,
  StatusUpdate,
} from '../types/handrawina';
import {
  decryptE2eePayload,
  deriveConversationKey,
  deriveSessionAesKey,
  encryptE2eePayload,
  generateEcdhKeyBundle,
  type IdentityKeyBundle,
} from '../crypto/e2eeEngine';
import { DEFAULT_APP_SETTINGS } from '../utils/settingsAndDialer';
import {
  BLUEPRINT_LIMITS,
  buildDirectConversationId,
  buildVisibleUidsForStatus,
  clampStr,
  deriveInitials,
  generateQrTokenCode,
  isValidStatusAudienceValue,
  isValidStatusThemeValue,
  mapMessageRecordToUi,
  resolvePeerPerspective,
  sanitizeFirestoreId,
  sortMessagesChronologically,
  type FirestoreConversationRecord,
  type FirestoreMessageRecord,
} from '../utils/multiUserChat';
import {
  extractPhoneFromAuthEmail,
  normalizePhoneForAuth,
  type PhoneDirectoryRecord,
  type SavedContactRecord,
} from '../utils/phoneAuthAndContacts';
import type { JoinBarcodeMode, MintedJoinToken } from '../components/app/JoinBarcodeModal';

const ECDH_STORAGE_PREFIX = 'handrawina_ecdh_v1_';
const DEFAULT_PRIVATE_PROFILE_PREFERENCES = {
  disappearingMessages: 'off',
  screenLockEnabled: false,
  alwaysRelayCallsTurn: false,
  lowDataCalls: false,
  defaultVideoQuality: '720p',
  soundNotifications: true,
  messagePreview: false,
  autoDownloadMedia: false,
} as const;

export interface PersistentIdentityKey {
  keyPair: CryptoKeyPair;
  publicKeyJwk: JsonWebKey;
  fingerprintHex: string;
}

/**
 * Loads or generates a persistent ECDH P-256 identity keypair per Firebase UID in localStorage.
 * Allows real cross-user ECDH shared secret derivation across page reloads.
 */
export async function loadOrCreateUserIdentityKey(uid: string): Promise<PersistentIdentityKey> {
  const storageKey = `${ECDH_STORAGE_PREFIX}${uid}`;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        privateJwk: JsonWebKey;
        publicJwk: JsonWebKey;
        fingerprintHex: string;
      };
      if (parsed.privateJwk && parsed.publicJwk && parsed.fingerprintHex) {
        const subtle = globalThis.crypto.subtle;
        const privateKey = await subtle.importKey(
          'jwk',
          parsed.privateJwk,
          { name: 'ECDH', namedCurve: 'P-256' },
          true,
          ['deriveKey', 'deriveBits']
        );
        const publicKey = await subtle.importKey(
          'jwk',
          parsed.publicJwk,
          { name: 'ECDH', namedCurve: 'P-256' },
          true,
          []
        );
        return {
          keyPair: { privateKey, publicKey },
          publicKeyJwk: parsed.publicJwk,
          fingerprintHex: parsed.fingerprintHex,
        };
      }
    }
  } catch {
    // Regenerate cleanly if corrupted or unavailable
  }

  const generated: IdentityKeyBundle = await generateEcdhKeyBundle();
  try {
    const privateJwk = await globalThis.crypto.subtle.exportKey('jwk', generated.keyPair.privateKey);
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        privateJwk,
        publicJwk: generated.publicKeyJwk,
        fingerprintHex: generated.fingerprintHex,
      })
    );
  } catch {
    // Ignore storage quota issues
  }
  return generated;
}

export async function importPeerPublicKey(jwk: JsonWebKey): Promise<CryptoKey | null> {
  try {
    return await globalThis.crypto.subtle.importKey(
      'jwk',
      { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, ext: true },
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      []
    );
  } catch {
    return null;
  }
}

export interface HydratedUserSession {
  displayName: string;
  phoneNumber: string;
  settings: AppSettings;
}

/**
 * Ensures /users/{uid}, /publicProfiles/{uid}, and primary device doc exist and stay in sync.
 */
export async function bootstrapAuthenticatedUser(
  user: User,
  identityKey: PersistentIdentityKey
): Promise<HydratedUserSession> {
  const uid = sanitizeFirestoreId(user.uid, 'user');
  const phoneIdentity = extractPhoneFromAuthEmail(user.email);
  const defaultDisplayName = clampStr(
    user.displayName || (phoneIdentity ? phoneIdentity.formatted : user.email?.split('@')[0]),
    BLUEPRINT_LIMITS.displayNameMax,
    'Pengguna Handrawina'
  );
  const email = clampStr(user.email, BLUEPRINT_LIMITS.emailMax, '');
  const pubX = clampStr(identityKey.publicKeyJwk.x, 128, '');
  const pubY = clampStr(identityKey.publicKeyJwk.y, 128, '');

  const userRef = doc(db, 'users', uid);
  const userPath = `users/${uid}`;
  let displayName = defaultDisplayName;
  let phoneNumber = phoneIdentity ? phoneIdentity.formatted : '+62 812-0000-0000';
  let settings: AppSettings = { ...DEFAULT_APP_SETTINGS };

  try {
    const existingSnap = await getDoc(userRef);
    if (existingSnap.exists()) {
      const data = existingSnap.data();
      displayName = clampStr(String(data.displayName ?? defaultDisplayName), 80, defaultDisplayName);
      phoneNumber = phoneIdentity
        ? phoneIdentity.formatted
        : clampStr(String(data.phoneNumber ?? '+62 812-0000-0000'), 32, '+62 812-0000-0000');
      settings = {
        aboutText: clampStr(String(data.aboutText ?? DEFAULT_APP_SETTINGS.aboutText), 200, DEFAULT_APP_SETTINGS.aboutText),
        readReceiptsEnabled: Boolean(data.readReceiptsEnabled ?? DEFAULT_APP_SETTINGS.readReceiptsEnabled),
        typingIndicatorsEnabled: Boolean(data.typingIndicatorsEnabled ?? DEFAULT_APP_SETTINGS.typingIndicatorsEnabled),
        backdropPreset: (data.backdropPreset as AppSettings['backdropPreset']) ?? DEFAULT_APP_SETTINGS.backdropPreset,
        backdropIntensity: (data.backdropIntensity as AppSettings['backdropIntensity']) ?? DEFAULT_APP_SETTINGS.backdropIntensity,
        backdropMotion: Boolean(data.backdropMotion ?? DEFAULT_APP_SETTINGS.backdropMotion),
        navbarTheme: isValidStatusThemeValue(String(data.navbarTheme ?? ''))
          ? (data.navbarTheme as StatusTheme)
          : DEFAULT_APP_SETTINGS.navbarTheme,
      };
    } else {
      await setDoc(userRef, {
        uid,
        displayName,
        email,
        phoneNumber,
        aboutText: settings.aboutText,
        navbarTheme: settings.navbarTheme,
        backdropPreset: settings.backdropPreset,
        backdropIntensity: settings.backdropIntensity,
        backdropMotion: settings.backdropMotion,
        readReceiptsEnabled: settings.readReceiptsEnabled,
        typingIndicatorsEnabled: settings.typingIndicatorsEnabled,
        ...DEFAULT_PRIVATE_PROFILE_PREFERENCES,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }

  // Sync non-PII public profile (for QR invites & peer ECDH key lookup)
  const pubRef = doc(db, 'publicProfiles', uid);
  const pubPath = `publicProfiles/${uid}`;
  const initials = deriveInitials(displayName);
  try {
    const pubSnap = await getDoc(pubRef);
    if (pubSnap.exists()) {
      await updateDoc(pubRef, {
        displayName,
        initials,
        fingerprintHex: identityKey.fingerprintHex,
        publicKeyJwkX: pubX,
        publicKeyJwkY: pubY,
        online: true,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(pubRef, {
        uid,
        displayName,
        initials,
        fingerprintHex: identityKey.fingerprintHex,
        publicKeyJwkX: pubX,
        publicKeyJwkY: pubY,
        online: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, pubPath);
  }

  // Sync exact phone lookup entry in /phoneDirectory/{phoneKey} so friends can add by phone number
  if (phoneIdentity) {
    const dirRef = doc(db, 'phoneDirectory', phoneIdentity.phoneKey);
    const dirPath = `phoneDirectory/${phoneIdentity.phoneKey}`;
    try {
      const dirSnap = await getDoc(dirRef);
      if (dirSnap.exists() && String(dirSnap.data().uid ?? '') === uid) {
        await updateDoc(dirRef, {
          phoneNumber: phoneIdentity.formatted,
          displayName,
          initials,
          aboutText: clampStr(settings.aboutText, BLUEPRINT_LIMITS.aboutMax, ''),
          fingerprintHex: identityKey.fingerprintHex,
          publicKeyJwkX: pubX,
          publicKeyJwkY: pubY,
          online: true,
          updatedAt: serverTimestamp(),
        });
      } else if (!dirSnap.exists()) {
        await setDoc(dirRef, {
          phoneKey: phoneIdentity.phoneKey,
          phoneNumber: phoneIdentity.formatted,
          uid,
          displayName,
          initials,
          aboutText: clampStr(settings.aboutText, BLUEPRINT_LIMITS.aboutMax, ''),
          fingerprintHex: identityKey.fingerprintHex,
          publicKeyJwkX: pubX,
          publicKeyJwkY: pubY,
          online: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, dirPath);
    }
  }

  // Ensure primary web device is registered under /users/{uid}/devices/dev_primary_web
  const primaryDeviceId = 'dev_primary_web';
  const devRef = doc(db, 'users', uid, 'devices', primaryDeviceId);
  try {
    const devSnap = await getDoc(devRef);
    if (!devSnap.exists()) {
      await setDoc(devRef, {
        deviceId: primaryDeviceId,
        ownerUid: uid,
        deviceIndex: 0,
        name: 'Browser Utama Handrawina',
        platform: 'Web',
        isPrimary: true,
        online: true,
        advSignatureShort: `adv-${identityKey.fingerprintHex.slice(0, 12)}`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}/devices/${primaryDeviceId}`);
  }

  return { displayName, phoneNumber, settings };
}

export async function updateUserPrivateSettings(
  uid: string,
  params: {
    displayName?: string;
    phoneNumber?: string;
    settings?: Partial<AppSettings>;
  }
): Promise<void> {
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const userRef = doc(db, 'users', safeUid);
  const patch: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (params.displayName !== undefined) {
    patch.displayName = clampStr(params.displayName, BLUEPRINT_LIMITS.displayNameMax, 'Pengguna Handrawina');
  }
  if (params.phoneNumber !== undefined) {
    patch.phoneNumber = clampStr(params.phoneNumber, BLUEPRINT_LIMITS.phoneMax, '');
  }
  if (params.settings) {
    const s = params.settings;
    if (s.aboutText !== undefined) patch.aboutText = clampStr(s.aboutText, BLUEPRINT_LIMITS.aboutMax, '');
    if (s.navbarTheme !== undefined && isValidStatusThemeValue(s.navbarTheme)) patch.navbarTheme = s.navbarTheme;
    if (s.backdropPreset !== undefined) patch.backdropPreset = s.backdropPreset;
    if (s.backdropIntensity !== undefined) patch.backdropIntensity = s.backdropIntensity;
    if (s.backdropMotion !== undefined) patch.backdropMotion = Boolean(s.backdropMotion);
    if (s.readReceiptsEnabled !== undefined) patch.readReceiptsEnabled = Boolean(s.readReceiptsEnabled);
    if (s.typingIndicatorsEnabled !== undefined) patch.typingIndicatorsEnabled = Boolean(s.typingIndicatorsEnabled);
  }

  try {
    await updateDoc(userRef, patch);
    if (params.displayName !== undefined) {
      const cleanName = clampStr(params.displayName, BLUEPRINT_LIMITS.displayNameMax, 'Pengguna Handrawina');
      await updateDoc(doc(db, 'publicProfiles', safeUid), {
        displayName: cleanName,
        initials: deriveInitials(cleanName),
        updatedAt: serverTimestamp(),
      });
    }
    if (params.phoneNumber && (params.displayName !== undefined || params.settings?.aboutText !== undefined)) {
      const parsedPhone = normalizePhoneForAuth(params.phoneNumber);
      if (parsedPhone.ok) {
        const dirPatch: Record<string, unknown> = { updatedAt: serverTimestamp() };
        if (params.displayName !== undefined) {
          const cleanName = clampStr(params.displayName, BLUEPRINT_LIMITS.displayNameMax, 'Pengguna Handrawina');
          dirPatch.displayName = cleanName;
          dirPatch.initials = deriveInitials(cleanName);
        }
        if (params.settings?.aboutText !== undefined) {
          dirPatch.aboutText = clampStr(params.settings.aboutText, BLUEPRINT_LIMITS.aboutMax, '');
        }
        await updateDoc(doc(db, 'phoneDirectory', parsedPhone.identity.phoneKey), dirPatch).catch(() => {});
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${safeUid}`);
  }
}

/**
 * Mints a real Firestore QR token so another user on another device can scan & connect.
 */
export async function mintFirestoreQrToken(params: {
  mode: JoinBarcodeMode;
  creatorUid: string;
  creatorName: string;
  identityKey: PersistentIdentityKey;
  existingCallRoomCode?: string | null;
}): Promise<MintedJoinToken> {
  const code =
    params.mode === 'call' && params.existingCallRoomCode
      ? sanitizeFirestoreId(params.existingCallRoomCode.toUpperCase(), generateQrTokenCode('call'))
      : generateQrTokenCode(params.mode);

  const safeUid = sanitizeFirestoreId(params.creatorUid, 'user');
  const cleanName = clampStr(params.creatorName, BLUEPRINT_LIMITS.displayNameMax, 'Pengguna Handrawina');
  const expiresInSec = params.mode === 'call' ? 600 : 300;
  const expiresAtMs = Date.now() + expiresInSec * 1000;

  const tokenRef = doc(db, 'qrTokens', code);
  try {
    await setDoc(tokenRef, {
      code,
      mode: params.mode,
      creatorUid: safeUid,
      creatorName: cleanName,
      creatorInitials: deriveInitials(cleanName),
      creatorFingerprint: params.identityKey.fingerprintHex,
      creatorPublicKeyX: clampStr(params.identityKey.publicKeyJwk.x, 128, ''),
      creatorPublicKeyY: clampStr(params.identityKey.publicKeyJwk.y, 128, ''),
      roomCode: params.mode === 'call' ? code : '',
      status: 'active',
      redeemedByUid: '',
      redeemedByName: '',
      conversationId: '',
      expiresAtMs,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `qrTokens/${code}`);
  }

  return {
    code,
    mode: params.mode,
    label:
      params.mode === 'invite'
        ? 'QR Hubungkan Obrolan Antar Pengguna (Firestore Real-Time)'
        : params.mode === 'pair'
        ? 'QR Tautkan Perangkat Companion (ADV E2EE)'
        : 'QR Ruang Video Call WebRTC P2P',
    expiresInSec,
    advChallenge: params.mode === 'pair' ? params.identityKey.fingerprintHex.slice(0, 8).toUpperCase() : undefined,
    roomId: params.mode === 'call' ? code : undefined,
  };
}

/**
 * Redeems a scanned QR token in Firestore:
 * - 'invite': atomically pairs User A and User B into a shared E2EE conversation in Firestore.
 * - 'pair': registers a real companion device under the user's account.
 * - 'call': returns the WebRTC roomCode to join live audio/video signaling.
 */
export async function redeemFirestoreQrToken(params: {
  code: string;
  redeemerUid: string;
  redeemerName: string;
  redeemerIdentityKey: PersistentIdentityKey;
  existingConversationIds: string[];
  deviceLabel?: string;
}): Promise<{
  ok: boolean;
  mode?: JoinBarcodeMode;
  message: string;
  conversationId?: string;
  callRoomCode?: string;
}> {
  const safeCode = sanitizeFirestoreId(params.code.toUpperCase(), '');
  if (!safeCode || safeCode.length < 8) {
    return { ok: false, message: 'Format kode QR Handrawina tidak valid.' };
  }

  const tokenRef = doc(db, 'qrTokens', safeCode);
  let snap;
  try {
    snap = await getDoc(tokenRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `qrTokens/${safeCode}`);
  }

  if (!snap.exists()) {
    return {
      ok: false,
      message: 'Kode QR tidak ditemukan di database Handrawina. Minta rekan Anda membuat QR baru.',
    };
  }

  const token = snap.data();
  const mode = token.mode as JoinBarcodeMode;

  if (mode === 'call') {
    const roomCode = clampStr(String(token.roomCode || safeCode), 32, safeCode);
    return {
      ok: true,
      mode: 'call',
      callRoomCode: roomCode,
      message: `Bergabung ke ruang panggilan WebRTC ${roomCode} milik ${String(token.creatorName ?? 'Host')}.`,
    };
  }

  if (token.status !== 'active') {
    return {
      ok: false,
      message: 'Kode QR ini sudah digunakan atau kedaluwarsa. Minta rekan Anda memperbarui kode QR.',
    };
  }

  if (typeof token.expiresAtMs === 'number' && Date.now() > token.expiresAtMs) {
    return {
      ok: false,
      message: 'Kode QR sudah melewati batas waktu berlaku. Silakan buat kode baru.',
    };
  }

  const redeemerUid = sanitizeFirestoreId(params.redeemerUid, 'user');
  const redeemerName = clampStr(params.redeemerName, BLUEPRINT_LIMITS.displayNameMax, 'Pengguna Handrawina');

  if (mode === 'pair') {
    const devId = `dev_${Date.now().toString(36)}`;
    const devName = clampStr(params.deviceLabel || `Perangkat ${redeemerName}`, 80, 'Perangkat Companion');
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', redeemerUid, 'devices', devId), {
      deviceId: devId,
      ownerUid: redeemerUid,
      deviceIndex: Math.floor(Math.random() * 20) + 1,
      name: devName,
      platform: 'Web',
      isPrimary: false,
      online: true,
      advSignatureShort: `adv-${params.redeemerIdentityKey.fingerprintHex.slice(0, 12)}`,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.update(tokenRef, {
      status: 'redeemed',
      redeemedByUid: redeemerUid,
      redeemedByName: redeemerName,
      conversationId: '',
      updatedAt: serverTimestamp(),
    });
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `qrTokens/${safeCode}`);
    }
    return {
      ok: true,
      mode: 'pair',
      message: `Perangkat "${devName}" berhasil ditautkan ke akun Anda secara permanen.`,
    };
  }

  // Mode: 'invite' -> Real cross-user pairing between creatorUid (User A) and redeemerUid (User B)
  const creatorUid = sanitizeFirestoreId(String(token.creatorUid ?? ''), '');
  if (!creatorUid) {
    return { ok: false, message: 'Data pembuat QR tidak valid.' };
  }
  if (creatorUid === redeemerUid) {
    return {
      ok: false,
      message:
        'Ini adalah kode QR milik akun Anda sendiri. Bagikan atau pindai QR ini dari akun Google / perangkat pengguna lain untuk memulai chat dua arah.',
    };
  }

  const convId = buildDirectConversationId(creatorUid, redeemerUid);
  const convRef = doc(db, 'conversations', convId);
  const alreadyExists = params.existingConversationIds.includes(convId);

  const creatorName = clampStr(String(token.creatorName ?? 'Rekan Handrawina'), 80, 'Rekan Handrawina');
  const creatorInitials = clampStr(String(token.creatorInitials ?? deriveInitials(creatorName)), 4, 'RH');
  const creatorFingerprint = clampStr(String(token.creatorFingerprint ?? '0000000000000000'), 64, '0000000000000000');
  const creatorPubX = clampStr(String(token.creatorPublicKeyX ?? ''), 128, '');
  const creatorPubY = clampStr(String(token.creatorPublicKeyY ?? ''), 128, '');

  const redeemerInitials = deriveInitials(redeemerName);
  const redeemerFingerprint = params.redeemerIdentityKey.fingerprintHex;
  const redeemerPubX = clampStr(params.redeemerIdentityKey.publicKeyJwk.x, 128, '');
  const redeemerPubY = clampStr(params.redeemerIdentityKey.publicKeyJwk.y, 128, '');

  const batch = writeBatch(db);
  if (alreadyExists) {
    // Refresh public key coordinates on existing thread
    batch.update(convRef, {
      userAName: creatorName,
      userAInitials: creatorInitials,
      userAFingerprint: creatorFingerprint,
      userAPublicKeyX: creatorPubX,
      userAPublicKeyY: creatorPubY,
      userBName: redeemerName,
      userBInitials: redeemerInitials,
      userBFingerprint: redeemerFingerprint,
      userBPublicKeyX: redeemerPubX,
      userBPublicKeyY: redeemerPubY,
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(convRef, {
      id: convId,
      kind: 'direct',
      name: creatorName,
      handle: 'Obrolan Terhubung via QR E2EE',
      initials: creatorInitials,
      creatorUid: redeemerUid,
      participantIds: [creatorUid, redeemerUid],
      userAUid: creatorUid,
      userAName: creatorName,
      userAInitials: creatorInitials,
      userAFingerprint: creatorFingerprint,
      userAPublicKeyX: creatorPubX,
      userAPublicKeyY: creatorPubY,
      userBUid: redeemerUid,
      userBName: redeemerName,
      userBInitials: redeemerInitials,
      userBFingerprint: redeemerFingerprint,
      userBPublicKeyX: redeemerPubX,
      userBPublicKeyY: redeemerPubY,
      senderKeyEpoch: 1,
      lastMessageText: `Terhubung melalui pemindaian QR dengan ${redeemerName}`,
      lastMessageSenderUid: redeemerUid,
      lastActiveText: 'Baru saja',
      typingUid: '',
      typingName: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  batch.update(tokenRef, {
    status: 'redeemed',
    redeemedByUid: redeemerUid,
    redeemedByName: redeemerName,
    conversationId: convId,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `qrTokens/${safeCode}`);
  }

  return {
    ok: true,
    mode: 'invite',
    conversationId: convId,
    message: `Berhasil terhubung dengan ${creatorName}! Obrolan real-time E2EE telah aktif di kedua akun.`,
  };
}

export async function createFirestoreGroupConversation(params: {
  creatorUid: string;
  creatorName: string;
  identityKey: PersistentIdentityKey;
  name: string;
  kind: ConversationKind;
  memberUids?: string[];
}): Promise<string> {
  const safeUid = sanitizeFirestoreId(params.creatorUid, 'user');
  const convId = `grp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const cleanName = clampStr(params.name, BLUEPRINT_LIMITS.displayNameMax, 'Grup Handrawina');
  const cleanCreator = clampStr(params.creatorName, BLUEPRINT_LIMITS.displayNameMax, 'Pengguna Handrawina');

  const uniqueParticipants = Array.from(
    new Set([
      safeUid,
      ...(params.memberUids ?? [])
        .map((id) => sanitizeFirestoreId(id, ''))
        .filter((id) => id.length > 0),
    ])
  ).slice(0, BLUEPRINT_LIMITS.maxParticipants);

  try {
    await setDoc(doc(db, 'conversations', convId), {
      id: convId,
      kind: params.kind,
      name: cleanName,
      handle:
        params.kind === 'group'
          ? `Grup Terenkripsi · ${uniqueParticipants.length} anggota`
          : 'Ruang Obrolan Handrawina',
      initials: deriveInitials(cleanName),
      creatorUid: safeUid,
      participantIds: uniqueParticipants,
      userAUid: safeUid,
      userAName: cleanCreator,
      userAInitials: deriveInitials(cleanCreator),
      userAFingerprint: params.identityKey.fingerprintHex,
      userAPublicKeyX: clampStr(params.identityKey.publicKeyJwk.x, 128, ''),
      userAPublicKeyY: clampStr(params.identityKey.publicKeyJwk.y, 128, ''),
      userBUid: '',
      userBName: '',
      userBInitials: '',
      userBFingerprint: '',
      userBPublicKeyX: '',
      userBPublicKeyY: '',
      senderKeyEpoch: 1,
      lastMessageText: `Grup dibuat oleh ${cleanCreator}`,
      lastMessageSenderUid: safeUid,
      lastActiveText: 'Baru saja',
      typingUid: '',
      typingName: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `conversations/${convId}`);
  }
  return convId;
}

/**
 * Encrypts and writes a real-time message into Firestore /conversations/{convId}/messages/{msgId}.
 * Uses real ECDH P-256 shared secret when peer's public key JWK is available.
 */
export async function sendFirestoreEncryptedMessage(params: {
  conversation: FirestoreConversationRecord;
  senderUid: string;
  senderName: string;
  identityKey: PersistentIdentityKey;
  plaintext: string;
  kind?: ChatMessage['kind'];
  voiceDurationSec?: number;
  mediaLabel?: string;
  mediaSizeKb?: number;
  ratchetStep: number;
}): Promise<void> {
  const convId = sanitizeFirestoreId(params.conversation.id, 'conv');
  const senderUid = sanitizeFirestoreId(params.senderUid, 'user');
  const cleanPlaintext = clampStr(params.plaintext, BLUEPRINT_LIMITS.messagePlaintextMax, '');
  if (!cleanPlaintext) return;

  const peer = resolvePeerPerspective(params.conversation, senderUid);
  const epoch = params.conversation.senderKeyEpoch || 1;
  const protocol =
    params.conversation.kind === 'group' ? 'SenderKeys-O1' : 'Signal-DoubleRatchet';

  let aesKey: CryptoKey;
  let encryptionMode: 'ecdh-p256' | 'room-aes256' = 'room-aes256';

  if (params.conversation.kind === 'direct' && peer.peerPublicKeyJwk) {
    const peerCryptoKey = await importPeerPublicKey(peer.peerPublicKeyJwk);
    if (peerCryptoKey) {
      aesKey = await deriveSessionAesKey(
        params.identityKey.keyPair.privateKey,
        peerCryptoKey,
        `${convId}:epoch-${epoch}`
      );
      encryptionMode = 'ecdh-p256';
    } else {
      aesKey = await deriveConversationKey(convId, epoch);
    }
  } else {
    aesKey = await deriveConversationKey(convId, epoch);
  }

  const envelope = await encryptE2eePayload({
    key: aesKey,
    plaintext: cleanPlaintext,
    aad: `${convId}:epoch-${epoch}`,
    protocol,
    ratchetStep: Math.max(1, params.ratchetStep),
    senderKeyEpoch: params.conversation.kind === 'group' ? epoch : undefined,
  });

  const messageId = `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const timestampLabel = new Date().toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const batch = writeBatch(db);
  batch.set(doc(db, 'conversations', convId, 'messages', messageId), {
    id: messageId,
    conversationId: convId,
    senderId: senderUid,
    senderName: clampStr(params.senderName, BLUEPRINT_LIMITS.displayNameMax, 'Pengguna Handrawina'),
    senderDeviceId: 'dev_primary_web',
    participantIds: params.conversation.participantIds.slice(0, BLUEPRINT_LIMITS.maxParticipants),
    kind: params.kind ?? 'text',
    plaintext: cleanPlaintext,
    cipherAlgorithm: 'AES-256-GCM',
    cipherProtocol: protocol,
    cipherIvBase64: envelope.ivBase64.slice(0, 128),
    ciphertextBase64: envelope.ciphertextBase64.slice(0, BLUEPRINT_LIMITS.ciphertextMax),
    cipherAad: envelope.aad.slice(0, 256),
    ratchetStep: Math.max(1, params.ratchetStep),
    encryptionMode,
    voiceDurationSec: Math.max(0, Math.min(3600, Math.round(params.voiceDurationSec ?? 0))),
    mediaLabel: clampStr(params.mediaLabel, 200, ''),
    mediaSizeKb: Math.max(0, Math.min(1048576, Math.round(params.mediaSizeKb ?? 0))),
    status: 'sent',
    timestampLabel,
    clientTimestampMs: Date.now(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'conversations', convId), {
    lastMessageText: cleanPlaintext.slice(0, BLUEPRINT_LIMITS.lastMessagePreviewMax),
    lastMessageSenderUid: senderUid,
    lastActiveText: timestampLabel,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `conversations/${convId}/messages/${messageId}`);
  }
}

export async function decryptMessageRecord(
  rec: FirestoreMessageRecord,
  conv: FirestoreConversationRecord,
  currentUid: string,
  identityKey: PersistentIdentityKey
): Promise<ChatMessage> {
  if (!rec.ciphertextBase64 || !rec.cipherIvBase64) {
    return mapMessageRecordToUi(rec);
  }
  try {
    const epoch = conv.senderKeyEpoch || 1;
    let key: CryptoKey | null = null;
    if (rec.encryptionMode === 'ecdh-p256' && conv.kind === 'direct') {
      const peer = resolvePeerPerspective(conv, currentUid);
      if (peer.peerPublicKeyJwk) {
        const peerKey = await importPeerPublicKey(peer.peerPublicKeyJwk);
        if (peerKey) {
          key = await deriveSessionAesKey(
            identityKey.keyPair.privateKey,
            peerKey,
            `${conv.id}:epoch-${epoch}`
          );
        }
      }
    } else {
      key = await deriveConversationKey(conv.id, epoch);
    }

    if (key) {
      const decrypted = await decryptE2eePayload(key, {
        algorithm: rec.cipherAlgorithm,
        protocol: rec.cipherProtocol,
        ivBase64: rec.cipherIvBase64,
        ciphertextBase64: rec.ciphertextBase64,
        ratchetStep: rec.ratchetStep,
        aad: rec.cipherAad,
      });
      return mapMessageRecordToUi(rec, decrypted);
    }
  } catch {
    // If local ECDH private key changed on a brand-new browser session, fall back cleanly
  }
  return mapMessageRecordToUi(rec);
}

export async function markFirestoreMessagesRead(
  convId: string,
  messages: ChatMessage[],
  currentUid: string
): Promise<void> {
  const unreadIncoming = messages.filter(
    (m) => m.senderId !== currentUid && m.senderId !== 'system' && m.status !== 'read'
  );
  if (unreadIncoming.length === 0) return;

  const batch = writeBatch(db);
  for (const msg of unreadIncoming.slice(0, 25)) {
    batch.update(doc(db, 'conversations', convId, 'messages', msg.id), {
      status: 'read',
      updatedAt: serverTimestamp(),
    });
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `conversations/${convId}/messages`);
  }
}

export async function updateFirestoreTyping(
  convId: string,
  currentUid: string,
  displayName: string,
  isTyping: boolean
): Promise<void> {
  try {
    await updateDoc(doc(db, 'conversations', convId), {
      typingUid: isTyping ? sanitizeFirestoreId(currentUid, 'user') : '',
      typingName: isTyping ? clampStr(displayName, 80, '') : '',
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-critical typing updates fail silently
  }
}

export async function rotateFirestoreGroupEpoch(
  convId: string,
  nextEpoch: number
): Promise<void> {
  try {
    await updateDoc(doc(db, 'conversations', convId), {
      senderKeyEpoch: Math.min(10000, Math.max(1, nextEpoch)),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `conversations/${convId}`);
  }
}

export function subscribeUserConversations(
  uid: string,
  onChange: (records: FirestoreConversationRecord[]) => void
): Unsubscribe {
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const q = query(
    collection(db, 'conversations'),
    where('participantIds', 'array-contains', safeUid)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: FirestoreConversationRecord[] = snapshot.docs.map((d) => {
        const data = d.data();
        const updatedAt = data.updatedAt as { toMillis?: () => number } | undefined;
        return {
          id: String(data.id ?? d.id),
          kind: (data.kind as ConversationKind) ?? 'direct',
          name: String(data.name ?? 'Obrolan'),
          handle: String(data.handle ?? ''),
          initials: String(data.initials ?? 'HN'),
          creatorUid: String(data.creatorUid ?? ''),
          participantIds: Array.isArray(data.participantIds) ? data.participantIds.map(String) : [],
          userAUid: String(data.userAUid ?? ''),
          userAName: String(data.userAName ?? ''),
          userAInitials: String(data.userAInitials ?? ''),
          userAPhone: typeof data.userAPhone === 'string' ? data.userAPhone : '',
          userAFingerprint: String(data.userAFingerprint ?? ''),
          userAPublicKeyX: String(data.userAPublicKeyX ?? ''),
          userAPublicKeyY: String(data.userAPublicKeyY ?? ''),
          userBUid: String(data.userBUid ?? ''),
          userBName: String(data.userBName ?? ''),
          userBInitials: String(data.userBInitials ?? ''),
          userBPhone: typeof data.userBPhone === 'string' ? data.userBPhone : '',
          userBFingerprint: String(data.userBFingerprint ?? ''),
          userBPublicKeyX: String(data.userBPublicKeyX ?? ''),
          userBPublicKeyY: String(data.userBPublicKeyY ?? ''),
          senderKeyEpoch: Number(data.senderKeyEpoch ?? 1),
          lastMessageText: String(data.lastMessageText ?? ''),
          lastMessageSenderUid: String(data.lastMessageSenderUid ?? ''),
          lastActiveText: String(data.lastActiveText ?? 'Aktif'),
          typingUid: String(data.typingUid ?? ''),
          typingName: String(data.typingName ?? ''),
          updatedAtMs: updatedAt?.toMillis ? updatedAt.toMillis() : 0,
        };
      });
      list.sort((a, b) => (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0));
      onChange(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'conversations');
    }
  );
}

export function subscribeConversationMessages(
  conv: FirestoreConversationRecord,
  currentUid: string,
  identityKey: PersistentIdentityKey,
  onChange: (messages: ChatMessage[]) => void
): Unsubscribe {
  const safeUid = sanitizeFirestoreId(currentUid, 'user');
  const path = `conversations/${conv.id}/messages`;
  const q = query(
    collection(db, 'conversations', conv.id, 'messages'),
    where('participantIds', 'array-contains', safeUid)
  );
  return onSnapshot(
    q,
    async (snapshot) => {
      const rawRecords: FirestoreMessageRecord[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id ?? d.id),
          conversationId: String(data.conversationId ?? conv.id),
          senderId: String(data.senderId ?? ''),
          senderName: String(data.senderName ?? 'Pengguna'),
          senderDeviceId: String(data.senderDeviceId ?? 'dev_web'),
          participantIds: Array.isArray(data.participantIds) ? data.participantIds.map(String) : [],
          kind: (data.kind as ChatMessage['kind']) ?? 'text',
          plaintext: String(data.plaintext ?? ''),
          cipherAlgorithm: 'AES-256-GCM',
          cipherProtocol: (data.cipherProtocol as FirestoreMessageRecord['cipherProtocol']) ?? 'Signal-DoubleRatchet',
          cipherIvBase64: String(data.cipherIvBase64 ?? ''),
          ciphertextBase64: String(data.ciphertextBase64 ?? ''),
          cipherAad: String(data.cipherAad ?? ''),
          ratchetStep: Number(data.ratchetStep ?? 1),
          encryptionMode: (data.encryptionMode as 'ecdh-p256' | 'room-aes256') ?? 'room-aes256',
          voiceDurationSec: Number(data.voiceDurationSec ?? 0),
          mediaLabel: String(data.mediaLabel ?? ''),
          mediaSizeKb: Number(data.mediaSizeKb ?? 0),
          status: (data.status as 'sent' | 'delivered' | 'read') ?? 'sent',
          timestampLabel: String(data.timestampLabel ?? '00:00'),
          clientTimestampMs: Number(data.clientTimestampMs ?? 0),
        };
      });
      const sorted = sortMessagesChronologically(rawRecords);
      const decrypted = await Promise.all(
        sorted.map((rec) => decryptMessageRecord(rec, conv, safeUid, identityKey))
      );
      onChange(decrypted);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeUserDevices(
  uid: string,
  onChange: (devices: PairedDevice[]) => void
): Unsubscribe {
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const path = `users/${safeUid}/devices`;
  const q = query(collection(db, 'users', safeUid, 'devices'), where('ownerUid', '==', safeUid));
  return onSnapshot(
    q,
    (snapshot) => {
      const devices: PairedDevice[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          deviceId: String(data.deviceId ?? d.id),
          deviceIndex: Number(data.deviceIndex ?? 0),
          name: String(data.name ?? 'Perangkat'),
          platform: (data.platform as PairedDevice['platform']) ?? 'Web',
          isPrimary: Boolean(data.isPrimary),
          online: Boolean(data.online),
          lastActive: data.online ? 'Aktif sekarang' : 'Terakhir aktif',
          advSignatureShort: String(data.advSignatureShort ?? 'adv-e2ee'),
        };
      });
      devices.sort((a, b) => a.deviceIndex - b.deviceIndex);
      onChange(devices);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function removeUserDevice(uid: string, deviceId: string): Promise<void> {
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const safeDevId = sanitizeFirestoreId(deviceId, '');
  if (!safeDevId) return;
  try {
    await deleteDoc(doc(db, 'users', safeUid, 'devices', safeDevId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${safeUid}/devices/${safeDevId}`);
  }
}

export function subscribeUserStatuses(
  uid: string,
  onChange: (statuses: StatusUpdate[]) => void
): Unsubscribe {
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const q = query(collection(db, 'statuses'), where('visibleToUids', 'array-contains', safeUid));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        const viewerUids = Array.isArray(data.viewerUids) ? data.viewerUids.map(String) : [];
        const viewerNames = Array.isArray(data.viewerNames) ? data.viewerNames.map(String) : [];
        const createdAt = data.createdAt as { toDate?: () => Date } | undefined;
        const createdLabel = createdAt?.toDate
          ? createdAt.toDate().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })
          : 'Baru saja';
        return {
          createdMs: createdAt?.toDate ? createdAt.toDate().getTime() : 0,
          status: {
            id: String(data.id ?? d.id),
            authorId: String(data.authorId ?? ''),
            authorName: String(data.authorName ?? 'Pengguna'),
            authorInitials: String(data.authorInitials ?? 'HN'),
            text: String(data.text ?? ''),
            captionTag: String(data.captionTag ?? '') || undefined,
            theme: isValidStatusThemeValue(String(data.theme ?? '')) ? (data.theme as StatusTheme) : 'navy',
            audience: isValidStatusAudienceValue(String(data.audience ?? ''))
              ? (data.audience as StatusAudience)
              : 'all-contacts',
            createdAt: createdLabel,
            expiresInLabel: '24 jam tersisa',
            viewedByMe: viewerUids.includes(safeUid) || String(data.authorId) === safeUid,
            viewerNames,
            reactions: [
              { label: 'Setuju', count: 0 },
              { label: 'Mantap', count: 0 },
              { label: 'Siap', count: 0 },
            ],
          } satisfies StatusUpdate,
        };
      });
      items.sort((a, b) => b.createdMs - a.createdMs);
      onChange(items.map((x) => x.status));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'statuses');
    }
  );
}

export async function createFirestoreStatus(params: {
  authorUid: string;
  authorName: string;
  text: string;
  theme: StatusTheme;
  audience: StatusAudience;
  captionTag?: string;
  conversations: FirestoreConversationRecord[];
  contactUids?: string[];
}): Promise<string> {
  const safeUid = sanitizeFirestoreId(params.authorUid, 'user');
  const statusId = `st_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const cleanName = clampStr(params.authorName, BLUEPRINT_LIMITS.displayNameMax, 'Pengguna Handrawina');
  const visibleToUids = buildVisibleUidsForStatus(safeUid, params.conversations, params.contactUids ?? []);

  try {
    await setDoc(doc(db, 'statuses', statusId), {
      id: statusId,
      authorId: safeUid,
      authorName: cleanName,
      authorInitials: deriveInitials(cleanName),
      text: clampStr(params.text, BLUEPRINT_LIMITS.statusTextMax, ''),
      captionTag: clampStr(params.captionTag, BLUEPRINT_LIMITS.captionTagMax, ''),
      theme: isValidStatusThemeValue(params.theme) ? params.theme : 'navy',
      audience: isValidStatusAudienceValue(params.audience) ? params.audience : 'all-contacts',
      visibleToUids,
      viewerUids: [],
      viewerNames: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `statuses/${statusId}`);
  }
  return statusId;
}

export async function markFirestoreStatusViewed(
  statusId: string,
  viewerUid: string,
  viewerName: string
): Promise<void> {
  const safeId = sanitizeFirestoreId(statusId, '');
  const safeUid = sanitizeFirestoreId(viewerUid, 'user');
  if (!safeId) return;
  const ref = doc(db, 'statuses', safeId);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    const viewerUids = Array.isArray(data.viewerUids) ? data.viewerUids.map(String) : [];
    const viewerNames = Array.isArray(data.viewerNames) ? data.viewerNames.map(String) : [];
    if (viewerUids.includes(safeUid) || viewerUids.length >= BLUEPRINT_LIMITS.maxStatusAudience) return;
    await updateDoc(ref, {
      viewerUids: [...viewerUids, safeUid],
      viewerNames: [...viewerNames, clampStr(viewerName, 80, 'Pengguna')],
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `statuses/${safeId}`);
  }
}

export async function deleteFirestoreStatus(statusId: string): Promise<void> {
  const safeId = sanitizeFirestoreId(statusId, '');
  if (!safeId) return;
  try {
    await deleteDoc(doc(db, 'statuses', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `statuses/${safeId}`);
  }
}

export function subscribeUserCallLogs(
  uid: string,
  onChange: (calls: CallRecord[]) => void
): Unsubscribe {
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const q = query(collection(db, 'users', safeUid, 'callLogs'), where('ownerUid', '==', safeUid));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        const createdAt = data.createdAt as { toMillis?: () => number } | undefined;
        return {
          createdMs: createdAt?.toMillis ? createdAt.toMillis() : 0,
          rec: {
            id: String(data.id ?? d.id),
            conversationId: String(data.conversationId ?? ''),
            peerName: String(data.peerName ?? 'Rekan'),
            mode: (data.mode as 'audio' | 'video') ?? 'video',
            topology: (data.topology as CallRecord['topology']) ?? 'P2P-DTLS-SRTP',
            participants: Array.isArray(data.participants) ? data.participants.map(String) : [],
            startedAt: String(data.startedAtLabel ?? 'Baru saja'),
            durationSec: Number(data.durationSec ?? 0),
            direction: (data.direction as 'outgoing' | 'incoming') ?? 'outgoing',
          } satisfies CallRecord,
        };
      });
      items.sort((a, b) => b.createdMs - a.createdMs);
      onChange(items.map((x) => x.rec));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${safeUid}/callLogs`);
    }
  );
}

export async function logFirestoreCall(
  uid: string,
  params: Omit<CallRecord, 'id' | 'startedAt'>
): Promise<void> {
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const callId = `call_${Date.now().toString(36)}`;
  const startedAtLabel = new Date().toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  try {
    await setDoc(doc(db, 'users', safeUid, 'callLogs', callId), {
      id: callId,
      ownerUid: safeUid,
      conversationId: clampStr(params.conversationId, 128, 'room'),
      peerName: clampStr(params.peerName, 80, 'Rekan Handrawina'),
      mode: params.mode,
      topology: params.topology,
      participants: params.participants.slice(0, 10).map((p) => clampStr(p, 80, 'Peserta')),
      startedAtLabel,
      durationSec: Math.max(0, Math.min(86400, Math.round(params.durationSec))),
      direction: params.direction,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${safeUid}/callLogs/${callId}`);
  }
}

// =========================================================================
// WhatsApp-Style Phone Directory Lookup & Personal Saved Contacts Book
// =========================================================================

/**
 * Performs a single-document exact phone lookup on /phoneDirectory/{phoneKey}.
 * Listing/scraping is strictly forbidden by Firestore rules.
 */
export async function lookupPhoneDirectory(
  phoneInput: string,
  countryCode = '+62'
): Promise<
  | { ok: true; found: true; entry: PhoneDirectoryRecord }
  | { ok: true; found: false; normalizedFormatted: string; phoneKey: string }
  | { ok: false; error: string }
> {
  const norm = normalizePhoneForAuth(phoneInput, countryCode);
  if (!norm.ok) {
    return { ok: false, error: norm.error };
  }

  const ref = doc(db, 'phoneDirectory', norm.identity.phoneKey);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      return {
        ok: true,
        found: false,
        normalizedFormatted: norm.identity.formatted,
        phoneKey: norm.identity.phoneKey,
      };
    }
    const d = snap.data();
    return {
      ok: true,
      found: true,
      entry: {
        phoneKey: String(d.phoneKey ?? norm.identity.phoneKey),
        phoneNumber: String(d.phoneNumber ?? norm.identity.formatted),
        uid: String(d.uid ?? ''),
        displayName: String(d.displayName ?? 'Pengguna Handrawina'),
        initials: String(d.initials ?? 'HN'),
        aboutText: String(d.aboutText ?? ''),
        fingerprintHex: String(d.fingerprintHex ?? '0000000000000000'),
        publicKeyJwkX: String(d.publicKeyJwkX ?? ''),
        publicKeyJwkY: String(d.publicKeyJwkY ?? ''),
        online: Boolean(d.online ?? true),
      },
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `phoneDirectory/${norm.identity.phoneKey}`);
  }
}

/**
 * Subscribes to the user's personal WhatsApp-style saved contacts (/users/{uid}/contacts).
 */
export function subscribeUserContacts(
  uid: string,
  onChange: (contacts: SavedContactRecord[]) => void
): Unsubscribe {
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const path = `users/${safeUid}/contacts`;
  const q = query(collection(db, 'users', safeUid, 'contacts'), where('ownerUid', '==', safeUid));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: SavedContactRecord[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          contactUid: String(data.contactUid ?? d.id),
          ownerUid: String(data.ownerUid ?? safeUid),
          contactName: String(data.contactName ?? data.profileName ?? 'Kontak'),
          profileName: String(data.profileName ?? data.contactName ?? 'Pengguna'),
          phoneNumber: String(data.phoneNumber ?? ''),
          phoneKey: String(data.phoneKey ?? ''),
          initials: String(data.initials ?? deriveInitials(String(data.contactName ?? 'HN'))),
          aboutText: String(data.aboutText ?? ''),
          fingerprintHex: String(data.fingerprintHex ?? '0000000000000000'),
          publicKeyJwkX: String(data.publicKeyJwkX ?? ''),
          publicKeyJwkY: String(data.publicKeyJwkY ?? ''),
        };
      });
      items.sort((a, b) => a.contactName.localeCompare(b.contactName, 'id-ID'));
      onChange(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

/**
 * Saves or updates a peer in /users/{ownerUid}/contacts/{contactUid} (e.g. from "Simpan ke Kontak" banner).
 */
export async function saveUserContactOnly(params: {
  ownerUid: string;
  contactUid: string;
  contactName: string;
  profileName: string;
  phoneNumber: string;
  phoneKey: string;
  aboutText?: string;
  fingerprintHex: string;
  publicKeyJwkX: string;
  publicKeyJwkY: string;
}): Promise<void> {
  const ownerUid = sanitizeFirestoreId(params.ownerUid, 'user');
  const contactUid = sanitizeFirestoreId(params.contactUid, 'peer');
  const cleanContactName = clampStr(params.contactName, BLUEPRINT_LIMITS.displayNameMax, 'Kontak Baru');
  const cleanProfileName = clampStr(params.profileName, BLUEPRINT_LIMITS.displayNameMax, cleanContactName);
  const cleanPhoneKey = params.phoneKey.replace(/\D/g, '').slice(0, 15);
  if (cleanPhoneKey.length < 8) {
    throw new Error('Format nomor telepon kontak tidak valid.');
  }

  const ref = doc(db, 'users', ownerUid, 'contacts', contactUid);
  const path = `users/${ownerUid}/contacts/${contactUid}`;
  const existing = await getDoc(ref).catch((error: unknown) => {
    handleFirestoreError(error, OperationType.GET, path);
  });

  if (existing.exists()) {
    try {
      await updateDoc(ref, {
        contactName: cleanContactName,
        profileName: cleanProfileName,
        phoneNumber: clampStr(params.phoneNumber, BLUEPRINT_LIMITS.phoneMax, `+${cleanPhoneKey}`),
        phoneKey: cleanPhoneKey,
        initials: deriveInitials(cleanContactName),
        aboutText: clampStr(params.aboutText, BLUEPRINT_LIMITS.aboutMax, ''),
        fingerprintHex: clampStr(params.fingerprintHex, 64, '0000000000000000'),
        publicKeyJwkX: clampStr(params.publicKeyJwkX, 128, ''),
        publicKeyJwkY: clampStr(params.publicKeyJwkY, 128, ''),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  } else {
    try {
      await setDoc(ref, {
        contactUid,
        ownerUid,
        contactName: cleanContactName,
        profileName: cleanProfileName,
        phoneNumber: clampStr(params.phoneNumber, BLUEPRINT_LIMITS.phoneMax, `+${cleanPhoneKey}`),
        phoneKey: cleanPhoneKey,
        initials: deriveInitials(cleanContactName),
        aboutText: clampStr(params.aboutText, BLUEPRINT_LIMITS.aboutMax, ''),
        fingerprintHex: clampStr(params.fingerprintHex, 64, '0000000000000000'),
        publicKeyJwkX: clampStr(params.publicKeyJwkX, 128, ''),
        publicKeyJwkY: clampStr(params.publicKeyJwkY, 128, ''),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }
}

export async function deleteUserContact(ownerUid: string, contactUid: string): Promise<void> {
  const safeOwner = sanitizeFirestoreId(ownerUid, 'user');
  const safeContact = sanitizeFirestoreId(contactUid, '');
  if (!safeContact) return;
  try {
    await deleteDoc(doc(db, 'users', safeOwner, 'contacts', safeContact));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${safeOwner}/contacts/${safeContact}`);
  }
}

/**
 * WhatsApp-style "Simpan Kontak & Mulai Chat":
 * 1. Saves the peer into the user's personal /users/{uid}/contacts/{peerUid}
 * 2. Creates or refreshes the deterministic E2EE direct conversation /conversations/dm_{uidA}_{uidB}
 *    including both users' formatted phone numbers so the recipient immediately sees who messaged them.
 */
export async function saveContactAndStartDirectChat(params: {
  ownerUid: string;
  ownerName: string;
  ownerPhone: string;
  ownerIdentityKey: PersistentIdentityKey;
  peer: PhoneDirectoryRecord;
  contactName: string;
  existingConversationIds: string[];
}): Promise<{ conversationId: string }> {
  const ownerUid = sanitizeFirestoreId(params.ownerUid, 'user');
  const peerUid = sanitizeFirestoreId(params.peer.uid, 'peer');
  if (ownerUid === peerUid) {
    throw new Error('Ini adalah nomor telepon akun Anda sendiri.');
  }

  // 1. Save contact in personal contact book
  await saveUserContactOnly({
    ownerUid,
    contactUid: peerUid,
    contactName: params.contactName,
    profileName: params.peer.displayName,
    phoneNumber: params.peer.phoneNumber,
    phoneKey: params.peer.phoneKey,
    aboutText: params.peer.aboutText,
    fingerprintHex: params.peer.fingerprintHex,
    publicKeyJwkX: params.peer.publicKeyJwkX,
    publicKeyJwkY: params.peer.publicKeyJwkY,
  });

  // 2. Ensure deterministic direct E2EE conversation exists between both accounts
  const convId = buildDirectConversationId(ownerUid, peerUid);
  const convRef = doc(db, 'conversations', convId);
  const cleanOwnerName = clampStr(params.ownerName, BLUEPRINT_LIMITS.displayNameMax, 'Pengguna Handrawina');
  const cleanOwnerPhone = clampStr(params.ownerPhone, BLUEPRINT_LIMITS.phoneMax, '');
  const cleanPeerName = clampStr(params.peer.displayName, BLUEPRINT_LIMITS.displayNameMax, 'Kontak Handrawina');
  const cleanPeerPhone = clampStr(params.peer.phoneNumber, BLUEPRINT_LIMITS.phoneMax, '');

  const alreadyExists = params.existingConversationIds.includes(convId);
  try {
    if (alreadyExists) {
      const existingSnap = await getDoc(convRef);
      if (existingSnap.exists()) {
        const cur = existingSnap.data();
        const iAmUserA = cur.userAUid === ownerUid;
        await updateDoc(convRef, {
          userAName: iAmUserA ? cleanOwnerName : cleanPeerName,
          userAInitials: deriveInitials(iAmUserA ? cleanOwnerName : cleanPeerName),
          userAPhone: iAmUserA ? cleanOwnerPhone : cleanPeerPhone,
          userAFingerprint: iAmUserA
            ? params.ownerIdentityKey.fingerprintHex
            : clampStr(params.peer.fingerprintHex, 64, '0000000000000000'),
          userAPublicKeyX: iAmUserA
            ? clampStr(params.ownerIdentityKey.publicKeyJwk.x, 128, '')
            : clampStr(params.peer.publicKeyJwkX, 128, ''),
          userAPublicKeyY: iAmUserA
            ? clampStr(params.ownerIdentityKey.publicKeyJwk.y, 128, '')
            : clampStr(params.peer.publicKeyJwkY, 128, ''),
          userBName: iAmUserA ? cleanPeerName : cleanOwnerName,
          userBInitials: deriveInitials(iAmUserA ? cleanPeerName : cleanOwnerName),
          userBPhone: iAmUserA ? cleanPeerPhone : cleanOwnerPhone,
          userBFingerprint: iAmUserA
            ? clampStr(params.peer.fingerprintHex, 64, '0000000000000000')
            : params.ownerIdentityKey.fingerprintHex,
          userBPublicKeyX: iAmUserA
            ? clampStr(params.peer.publicKeyJwkX, 128, '')
            : clampStr(params.ownerIdentityKey.publicKeyJwk.x, 128, ''),
          userBPublicKeyY: iAmUserA
            ? clampStr(params.peer.publicKeyJwkY, 128, '')
            : clampStr(params.ownerIdentityKey.publicKeyJwk.y, 128, ''),
          updatedAt: serverTimestamp(),
        });
        return { conversationId: convId };
      }
    }

    await setDoc(convRef, {
      id: convId,
      kind: 'direct',
      name: cleanPeerName,
      handle: cleanPeerPhone || 'Obrolan E2EE Handrawina',
      initials: deriveInitials(cleanPeerName),
      creatorUid: ownerUid,
      participantIds: [ownerUid, peerUid],
      userAUid: ownerUid,
      userAName: cleanOwnerName,
      userAInitials: deriveInitials(cleanOwnerName),
      userAPhone: cleanOwnerPhone,
      userAFingerprint: params.ownerIdentityKey.fingerprintHex,
      userAPublicKeyX: clampStr(params.ownerIdentityKey.publicKeyJwk.x, 128, ''),
      userAPublicKeyY: clampStr(params.ownerIdentityKey.publicKeyJwk.y, 128, ''),
      userBUid: peerUid,
      userBName: cleanPeerName,
      userBInitials: deriveInitials(cleanPeerName),
      userBPhone: cleanPeerPhone,
      userBFingerprint: clampStr(params.peer.fingerprintHex, 64, '0000000000000000'),
      userBPublicKeyX: clampStr(params.peer.publicKeyJwkX, 128, ''),
      userBPublicKeyY: clampStr(params.peer.publicKeyJwkY, 128, ''),
      senderKeyEpoch: 1,
      lastMessageText: `Obrolan terenkripsi dimulai dengan ${cleanPeerName}`,
      lastMessageSenderUid: ownerUid,
      lastActiveText: 'Baru saja',
      typingUid: '',
      typingName: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `conversations/${convId}`);
  }

  return { conversationId: convId };
}

