import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  auth,
  registerWithPhoneAndPin,
  signInWithGooglePopup,
  signInWithPhoneAndPin,
  signOutHandrawina,
  testFirestoreConnection,
} from '../firebase';
import type {
  AccountProfile,
  AppSettings,
  CallRecord,
  ChatMessage,
  Conversation,
  ConversationKind,
  PairedDevice,
  StatusAudience,
  StatusTheme,
  StatusUpdate,
} from '../types/handrawina';
import { DEFAULT_APP_SETTINGS } from '../utils/settingsAndDialer';
import {
  resolvePeerPerspective,
  type FirestoreConversationRecord,
} from '../utils/multiUserChat';
import {
  extractPhoneFromAuthEmail,
  normalizePhoneForAuth,
  resolveWhatsAppConversationMeta,
  type PhoneDirectoryRecord,
  type SavedContactRecord,
  type UserDirectoryProfile,
} from '../utils/phoneAuthAndContacts';
import {
  searchUserDirectoryPage,
  saveUserDirectoryContact,
  bootstrapAuthenticatedUser,
  createFirestoreGroupConversation,
  createFirestoreStatus,
  deleteFirestoreStatus,
  deleteUserContact,
  loadOrCreateUserIdentityKey,
  logFirestoreCall,
  lookupPhoneDirectory,
  markFirestoreMessagesRead,
  markFirestoreStatusViewed,
  mintFirestoreQrToken,
  redeemFirestoreQrToken,
  removeUserDevice,
  rotateFirestoreGroupEpoch,
  saveContactAndStartDirectChat,
  saveUserContactOnly,
  sendFirestoreEncryptedMessage,
  subscribeConversationMessages,
  subscribeUserCallLogs,
  subscribeUserContacts,
  subscribeUserConversations,
  subscribeUserDevices,
  subscribeUserStatuses,
  updateFirestoreTyping,
  updateUserDirectoryVisibility,
  updateUserPrivateSettings,
  type PersistentIdentityKey,
  type UserDirectoryCursor,
  type UserDirectoryPage,
} from '../services/handrawinaFirestore';
import {
  endCallRoom,
  subscribeIncomingCalls,
  type IncomingCallNotification,
} from '../services/webrtcSignaling';
import type { JoinBarcodeMode, MintedJoinToken } from '../components/app/JoinBarcodeModal';

export interface UnsavedPeerInfo {
  peerUid: string;
  peerPhone: string;
  peerProfileName: string;
  peerFingerprint: string;
  peerPublicKeyX: string;
  peerPublicKeyY: string;
}

export interface FirebaseHandrawinaState {
  authReady: boolean;
  firebaseUser: User | null;
  authError: string | null;
  clearAuthError: () => void;
  cloudBootstrapping: boolean;
  identityKey: PersistentIdentityKey | null;
  account: AccountProfile | null;
  settings: AppSettings;
  rawConversations: FirestoreConversationRecord[];
  conversations: Conversation[];
  contacts: SavedContactRecord[];
  directoryVisible: boolean;
  unsavedPeerByConv: Record<string, UnsavedPeerInfo | null>;
  messagesByConv: Record<string, ChatMessage[]>;
  devices: PairedDevice[];
  statuses: StatusUpdate[];
  calls: CallRecord[];
  typingByConv: Record<string, string | null>;
  incomingCall: IncomingCallNotification | null;
  dismissIncomingCall: () => void;
  rejectIncomingCall: () => Promise<{ ok: boolean; error?: string }>;
  signInPhone: (params: { phoneInput: string; countryCode: string; pin: string }) => Promise<boolean>;
  registerPhone: (params: {
    phoneInput: string;
    countryCode: string;
    pin: string;
    displayName: string;
  }) => Promise<boolean>;
  signInGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  lookupPhone: (
    phoneInput: string,
    countryCode?: string
  ) => Promise<
    | { ok: true; found: true; entry: PhoneDirectoryRecord }
    | { ok: true; found: false; normalizedFormatted: string; phoneKey: string }
    | { ok: false; error: string }
  >;
  searchUserDirectory: (
    searchText: string,
    cursor?: UserDirectoryCursor | null
  ) => Promise<UserDirectoryPage>;
  addDirectoryContact: (
    profile: UserDirectoryProfile
  ) => Promise<{ ok: boolean; message: string }>;
  setDirectoryVisibility: (visible: boolean) => Promise<void>;
  saveContactAndChat: (params: {
    peer: PhoneDirectoryRecord;
    contactName: string;
  }) => Promise<{ ok: boolean; conversationId?: string; message: string }>;
  openChatWithSavedContact: (
    contact: SavedContactRecord
  ) => Promise<{ ok: boolean; conversationId?: string; message: string }>;
  saveUnsavedPeerFromConv: (params: {
    conversationId: string;
    contactName: string;
  }) => Promise<{ ok: boolean; message: string }>;
  deleteContact: (contactUid: string) => Promise<void>;
  mintQrToken: (mode: JoinBarcodeMode, existingCallRoomCode?: string | null) => Promise<MintedJoinToken>;
  redeemQrCode: (params: {
    code: string;
    memberName?: string;
  }) => Promise<{
    ok: boolean;
    mode?: JoinBarcodeMode;
    message: string;
    conversationId?: string;
    callRoomCode?: string;
  }>;
  sendMessage: (params: {
    conversationId: string;
    plaintext: string;
    kind?: ChatMessage['kind'];
    voiceDurationSec?: number;
    mediaLabel?: string;
    mediaSizeKb?: number;
  }) => Promise<void>;
  createConversation: (params: {
    name: string;
    kind: ConversationKind;
    memberUids?: string[];
  }) => Promise<string | null>;
  rotateGroupEpoch: (conversationId: string) => Promise<void>;
  setTyping: (conversationId: string, isTyping: boolean) => void;
  markConversationRead: (conversationId: string) => void;
  createStatus: (params: {
    text: string;
    theme: StatusTheme;
    audience: StatusAudience;
    captionTag?: string;
  }) => Promise<{ ok: boolean; createdId?: string; error?: string }>;
  markStatusViewed: (statusId: string) => Promise<void>;
  deleteStatus: (statusId: string) => Promise<void>;
  revokeDevice: (deviceId: string) => Promise<void>;
  saveSettings: (params: {
    displayName?: string;
    settings: Partial<AppSettings>;
  }) => Promise<{ ok: boolean; message: string }>;
  resetSettings: () => Promise<void>;
  logCall: (params: Omit<CallRecord, 'id' | 'startedAt'>) => Promise<void>;
  getPeerUidForConversation: (conversationId: string) => string | undefined;
}

export function useFirebaseHandrawina(activeConvId: string): FirebaseHandrawinaState {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [cloudBootstrapping, setCloudBootstrapping] = useState(false);

  const [identityKey, setIdentityKey] = useState<PersistentIdentityKey | null>(null);
  const [displayName, setDisplayName] = useState<string>('');
  const [phoneNumber, setPhoneNumber] = useState<string>('+62 812-0000-0000');
  const [settings, setSettings] = useState<AppSettings>({ ...DEFAULT_APP_SETTINGS });
  const [directoryVisible, setDirectoryVisibleState] = useState(true);

  const [rawConversations, setRawConversations] = useState<FirestoreConversationRecord[]>([]);
  const [contacts, setContacts] = useState<SavedContactRecord[]>([]);
  const [messagesByConv, setMessagesByConv] = useState<Record<string, ChatMessage[]>>({});
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [statuses, setStatuses] = useState<StatusUpdate[]>([]);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [incomingCall, setIncomingCall] = useState<IncomingCallNotification | null>(null);
  const dismissedCallRoomRef = useRef<string | null>(null);

  // Startup Firestore connectivity test (required by Firebase skill)
  useEffect(() => {
    void testFirestoreConnection();
  }, []);

  // Auth state observer
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (!user) {
        setIdentityKey(null);
        setDirectoryVisibleState(true);
        setRawConversations([]);
        setContacts([]);
        setMessagesByConv({});
        setDevices([]);
        setStatuses([]);
        setCalls([]);
        setIncomingCall(null);
      }
    });
    return () => unsub();
  }, []);

  // Bootstrap user profile, phoneDirectory, ECDH keypair, and Firestore listeners once authenticated
  useEffect(() => {
    if (!authReady || !firebaseUser) return;
    let cancelled = false;
    const unsubscribers: (() => void)[] = [];

    async function initCloudSession(user: User) {
      setCloudBootstrapping(true);
      setAuthError(null);
      try {
        const key = await loadOrCreateUserIdentityKey(user.uid);
        if (cancelled) return;
        setIdentityKey(key);

        const hydrated = await bootstrapAuthenticatedUser(user, key);
        if (cancelled) return;
        setDisplayName(hydrated.displayName);
        setPhoneNumber(hydrated.phoneNumber);
        setSettings(hydrated.settings);
        setDirectoryVisibleState(hydrated.directoryVisible);

        unsubscribers.push(
          subscribeUserConversations(user.uid, (list) => {
            if (!cancelled) setRawConversations(list);
          })
        );
        unsubscribers.push(
          subscribeUserContacts(user.uid, (list) => {
            if (!cancelled) setContacts(list);
          })
        );
        unsubscribers.push(
          subscribeUserDevices(user.uid, (list) => {
            if (!cancelled) setDevices(list);
          })
        );
        unsubscribers.push(
          subscribeUserStatuses(user.uid, (list) => {
            if (!cancelled) setStatuses(list);
          })
        );
        unsubscribers.push(
          subscribeUserCallLogs(user.uid, (list) => {
            if (!cancelled) setCalls(list);
          })
        );
        unsubscribers.push(
          subscribeIncomingCalls(user.uid, (notif) => {
            if (cancelled) return;
            if (!notif) {
              setIncomingCall(null);
              return;
            }
            if (dismissedCallRoomRef.current === notif.roomCode) return;
            setIncomingCall(notif);
          })
        );
      } catch (err) {
        if (!cancelled) {
          setAuthError(
            err instanceof Error ? err.message : 'Gagal menyinkronkan profil Firebase.'
          );
        }
      } finally {
        if (!cancelled) setCloudBootstrapping(false);
      }
    }

    void initCloudSession(firebaseUser);
    return () => {
      cancelled = true;
      for (const u of unsubscribers) u();
    };
  }, [authReady, firebaseUser]);

  // Subscribe to real-time messages for the active conversation
  const activeCloudConv = useMemo(
    () =>
      rawConversations.find((c) => c.id === activeConvId) ??
      rawConversations[0] ??
      null,
    [rawConversations, activeConvId]
  );

  useEffect(() => {
    if (!firebaseUser || !identityKey || !activeCloudConv) return;
    const unsub = subscribeConversationMessages(
      activeCloudConv,
      firebaseUser.uid,
      identityKey,
      (msgs) => {
        setMessagesByConv((prev) => ({
          ...prev,
          [activeCloudConv.id]: msgs,
        }));
        if (settings.readReceiptsEnabled) {
          void markFirestoreMessagesRead(activeCloudConv.id, msgs, firebaseUser.uid).catch(
            () => {}
          );
        }
      }
    );
    return () => unsub();
  }, [
    firebaseUser,
    identityKey,
    activeCloudConv?.id,
    activeCloudConv?.senderKeyEpoch,
    activeCloudConv?.userAPublicKeyX,
    activeCloudConv?.userBPublicKeyX,
    settings.readReceiptsEnabled,
  ]);

  const contactsByUid = useMemo(() => {
    const map: Record<string, SavedContactRecord> = {};
    for (const c of contacts) {
      map[c.contactUid] = c;
    }
    return map;
  }, [contacts]);

  const { conversations, unsavedPeerByConv } = useMemo(() => {
    if (!firebaseUser) {
      return {
        conversations: [] as Conversation[],
        unsavedPeerByConv: {} as Record<string, UnsavedPeerInfo | null>,
      };
    }
    const convList: Conversation[] = [];
    const unsavedMap: Record<string, UnsavedPeerInfo | null> = {};

    for (const rec of rawConversations) {
      const msgs = messagesByConv[rec.id] ?? [];
      const unread = msgs.filter(
        (m) => m.senderId !== firebaseUser.uid && m.senderId !== 'system' && m.status !== 'read'
      ).length;
      const meta = resolveWhatsAppConversationMeta(rec, firebaseUser.uid, unread, contactsByUid);
      convList.push(meta.conversation);

      if (!meta.isSavedContact && meta.peerUid) {
        const peer = resolvePeerPerspective(rec, firebaseUser.uid);
        unsavedMap[rec.id] = {
          peerUid: meta.peerUid,
          peerPhone: meta.peerPhone,
          peerProfileName: meta.peerProfileName,
          peerFingerprint: peer.peerFingerprint,
          peerPublicKeyX: peer.peerPublicKeyJwk?.x ?? '',
          peerPublicKeyY: peer.peerPublicKeyJwk?.y ?? '',
        };
      } else {
        unsavedMap[rec.id] = null;
      }
    }

    return { conversations: convList, unsavedPeerByConv: unsavedMap };
  }, [rawConversations, messagesByConv, firebaseUser, contactsByUid]);

  const typingByConv = useMemo(() => {
    const map: Record<string, string | null> = {};
    if (!firebaseUser) return map;
    for (const rec of rawConversations) {
      if (rec.typingUid && rec.typingUid !== firebaseUser.uid && rec.typingName) {
        const saved = contactsByUid[rec.typingUid];
        map[rec.id] = saved ? saved.contactName : rec.typingName;
      } else {
        map[rec.id] = null;
      }
    }
    return map;
  }, [rawConversations, firebaseUser, contactsByUid]);

  const account: AccountProfile | null = useMemo(() => {
    if (!firebaseUser) return null;
    const name = displayName || firebaseUser.displayName || 'Pengguna Handrawina';
    const fp = identityKey?.fingerprintHex ?? '0000000000000000';
    return {
      accountId: firebaseUser.uid,
      displayName: name,
      phoneNumber,
      phoneHashShort: `uid-${firebaseUser.uid.slice(0, 8)}`,
      primaryIdentityPubShort: `ECDH-${fp.slice(0, 12).toUpperCase()}`,
      primaryPhoneOnline: true,
    };
  }, [firebaseUser, displayName, phoneNumber, identityKey]);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const signInPhone = useCallback(
    async (params: { phoneInput: string; countryCode: string; pin: string }): Promise<boolean> => {
      setAuthError(null);
      try {
        await signInWithPhoneAndPin(params);
        return true;
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Gagal masuk dengan nomor telepon.');
        return false;
      }
    },
    []
  );

  const registerPhone = useCallback(
    async (params: {
      phoneInput: string;
      countryCode: string;
      pin: string;
      displayName: string;
    }): Promise<boolean> => {
      setAuthError(null);
      try {
        await registerWithPhoneAndPin(params);
        return true;
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Gagal mendaftarkan nomor telepon.');
        return false;
      }
    },
    []
  );

  const signInGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithGooglePopup();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal masuk dengan Google.';
      if (msg.includes('popup-closed-by-user')) {
        setAuthError('Jendela login ditutup sebelum selesai. Silakan coba lagi.');
      } else {
        setAuthError(msg);
      }
    }
  }, []);

  const signOutUser = useCallback(async () => {
    await signOutHandrawina();
  }, []);

  const lookupPhone = useCallback(
    async (phoneInput: string, countryCode = '+62') => {
      if (!firebaseUser) {
        return {
          ok: false as const,
          error: 'Masuk terlebih dahulu dengan nomor telepon Anda untuk mencari kontak.',
        };
      }
      return lookupPhoneDirectory(phoneInput, countryCode);
    },
    [firebaseUser]
  );

  const searchUserDirectory = useCallback(
    (searchText: string, cursor: UserDirectoryCursor | null = null) => {
      if (!firebaseUser) {
        return Promise.reject(new Error('Masuk terlebih dahulu untuk melihat direktori pengguna.'));
      }
      return searchUserDirectoryPage(searchText, cursor);
    },
    [firebaseUser]
  );

  const addDirectoryContact = useCallback(
    async (profile: UserDirectoryProfile) => {
      if (!firebaseUser) {
        return { ok: false, message: 'Masuk terlebih dahulu untuk menambahkan kontak.' };
      }
      try {
        await saveUserDirectoryContact(firebaseUser.uid, profile);
        return { ok: true, message: `${profile.displayName} ditambahkan ke kontak.` };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : 'Gagal menambahkan kontak.',
        };
      }
    },
    [firebaseUser]
  );

  const setDirectoryVisibility = useCallback(
    async (visible: boolean) => {
      if (!firebaseUser) throw new Error('Masuk terlebih dahulu untuk mengubah visibilitas.');
      await updateUserDirectoryVisibility(firebaseUser.uid, visible);
      setDirectoryVisibleState(visible);
    },
    [firebaseUser]
  );

  const saveContactAndChat = useCallback(
    async (params: { peer: PhoneDirectoryRecord; contactName: string }) => {
      if (!firebaseUser || !identityKey) {
        return { ok: false, message: 'Silakan masuk dengan nomor telepon terlebih dahulu.' };
      }
      if (params.peer.uid === firebaseUser.uid) {
        return { ok: false, message: 'Ini adalah nomor telepon akun Anda sendiri.' };
      }
      try {
        const res = await saveContactAndStartDirectChat({
          ownerUid: firebaseUser.uid,
          ownerName: displayName || firebaseUser.displayName || 'Pengguna Handrawina',
          ownerPhone:
            firebaseUser.phoneNumber ||
            extractPhoneFromAuthEmail(firebaseUser.email)?.formatted ||
            '',
          ownerIdentityKey: identityKey,
          peer: params.peer,
          contactName: params.contactName,
          existingConversationIds: rawConversations.map((c) => c.id),
        });
        return {
          ok: true,
          conversationId: res.conversationId,
          message: `Kontak "${params.contactName}" disimpan. Ruang chat E2EE siap digunakan.`,
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : 'Gagal menyimpan kontak.',
        };
      }
    },
    [firebaseUser, identityKey, displayName, rawConversations]
  );

  const openChatWithSavedContact = useCallback(
    async (contact: SavedContactRecord) => {
      return saveContactAndChat({
        contactName: contact.contactName,
        peer: {
          phoneKey: contact.phoneKey,
          phoneNumber: contact.phoneNumber,
          uid: contact.contactUid,
          displayName: contact.profileName,
          initials: contact.initials,
          aboutText: contact.aboutText,
          fingerprintHex: contact.fingerprintHex,
          publicKeyJwkX: contact.publicKeyJwkX,
          publicKeyJwkY: contact.publicKeyJwkY,
          online: true,
        },
      });
    },
    [saveContactAndChat]
  );

  const saveUnsavedPeerFromConv = useCallback(
    async (params: { conversationId: string; contactName: string }) => {
      if (!firebaseUser) {
        return { ok: false, message: 'Belum masuk akun.' };
      }
      const info = unsavedPeerByConv[params.conversationId];
      if (!info) {
        return { ok: false, message: 'Kontak sudah tersimpan.' };
      }
      const cleanName = params.contactName.trim();
      if (!cleanName) {
        return { ok: false, message: 'Nama kontak tidak boleh kosong.' };
      }
      const norm = normalizePhoneForAuth(info.peerPhone || '');
      const phoneKey = norm.ok ? norm.identity.phoneKey : '6200000000';
      const formattedPhone = norm.ok ? norm.identity.formatted : info.peerPhone || '+62 800-0000-0000';

      try {
        await saveUserContactOnly({
          ownerUid: firebaseUser.uid,
          contactUid: info.peerUid,
          contactName: cleanName,
          profileName: info.peerProfileName,
          phoneNumber: formattedPhone,
          phoneKey,
          aboutText: '',
          fingerprintHex: info.peerFingerprint || '0000000000000000',
          publicKeyJwkX: info.peerPublicKeyX,
          publicKeyJwkY: info.peerPublicKeyY,
        });
        return {
          ok: true,
          message: `"${cleanName}" berhasil disimpan ke daftar kontak Anda.`,
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : 'Gagal menyimpan kontak.',
        };
      }
    },
    [firebaseUser, unsavedPeerByConv]
  );

  const deleteContact = useCallback(
    async (contactUid: string) => {
      if (!firebaseUser) return;
      await deleteUserContact(firebaseUser.uid, contactUid);
    },
    [firebaseUser]
  );

  const mintQrToken = useCallback(
    async (mode: JoinBarcodeMode, existingCallRoomCode?: string | null) => {
      if (!firebaseUser || !identityKey) {
        throw new Error('Silakan masuk dengan nomor telepon terlebih dahulu.');
      }
      return mintFirestoreQrToken({
        mode,
        creatorUid: firebaseUser.uid,
        creatorName: displayName || firebaseUser.displayName || 'Pengguna Handrawina',
        identityKey,
        existingCallRoomCode,
      });
    },
    [firebaseUser, identityKey, displayName]
  );

  const redeemQrCode = useCallback(
    async (params: { code: string; memberName?: string }) => {
      if (!firebaseUser || !identityKey) {
        return { ok: false, message: 'Silakan masuk dengan nomor telepon terlebih dahulu.' };
      }
      return redeemFirestoreQrToken({
        code: params.code,
        redeemerUid: firebaseUser.uid,
        redeemerName: displayName || firebaseUser.displayName || 'Pengguna Handrawina',
        redeemerIdentityKey: identityKey,
        existingConversationIds: rawConversations.map((c) => c.id),
        deviceLabel: params.memberName,
      });
    },
    [firebaseUser, identityKey, displayName, rawConversations]
  );

  const sendMessage = useCallback(
    async (params: {
      conversationId: string;
      plaintext: string;
      kind?: ChatMessage['kind'];
      voiceDurationSec?: number;
      mediaLabel?: string;
      mediaSizeKb?: number;
    }) => {
      if (!firebaseUser || !identityKey) return;
      const conv = rawConversations.find((c) => c.id === params.conversationId);
      if (!conv) return;
      const currentMsgs = messagesByConv[conv.id] ?? [];
      await sendFirestoreEncryptedMessage({
        conversation: conv,
        senderUid: firebaseUser.uid,
        senderName: displayName || firebaseUser.displayName || 'Pengguna Handrawina',
        identityKey,
        plaintext: params.plaintext,
        kind: params.kind,
        voiceDurationSec: params.voiceDurationSec,
        mediaLabel: params.mediaLabel,
        mediaSizeKb: params.mediaSizeKb,
        ratchetStep: currentMsgs.length + 1,
      });
    },
    [firebaseUser, identityKey, rawConversations, messagesByConv, displayName]
  );

  const createConversation = useCallback(
    async (params: { name: string; kind: ConversationKind; memberUids?: string[] }) => {
      if (!firebaseUser || !identityKey) return null;
      return createFirestoreGroupConversation({
        creatorUid: firebaseUser.uid,
        creatorName: displayName || firebaseUser.displayName || 'Pengguna Handrawina',
        identityKey,
        name: params.name,
        kind: params.kind,
        memberUids: params.memberUids,
      });
    },
    [firebaseUser, identityKey, displayName]
  );

  const rotateGroupEpoch = useCallback(
    async (conversationId: string) => {
      const conv = rawConversations.find((c) => c.id === conversationId);
      if (!conv) return;
      await rotateFirestoreGroupEpoch(conv.id, (conv.senderKeyEpoch || 1) + 1);
    },
    [rawConversations]
  );

  const setTyping = useCallback(
    (conversationId: string, isTyping: boolean) => {
      if (!firebaseUser || !settings.typingIndicatorsEnabled) return;
      void updateFirestoreTyping(
        conversationId,
        firebaseUser.uid,
        displayName || firebaseUser.displayName || 'Pengguna',
        isTyping
      );
    },
    [firebaseUser, displayName, settings.typingIndicatorsEnabled]
  );

  const markConversationRead = useCallback(
    (conversationId: string) => {
      if (!firebaseUser || !settings.readReceiptsEnabled) return;
      const msgs = messagesByConv[conversationId] ?? [];
      void markFirestoreMessagesRead(conversationId, msgs, firebaseUser.uid).catch(() => {});
    },
    [firebaseUser, messagesByConv, settings.readReceiptsEnabled]
  );

  const createStatus = useCallback(
    async (params: {
      text: string;
      theme: StatusTheme;
      audience: StatusAudience;
      captionTag?: string;
    }) => {
      if (!firebaseUser) return { ok: false, error: 'Belum masuk akun.' };
      try {
        const createdId = await createFirestoreStatus({
          authorUid: firebaseUser.uid,
          authorName: displayName || firebaseUser.displayName || 'Pengguna Handrawina',
          text: params.text,
          theme: params.theme,
          audience: params.audience,
          captionTag: params.captionTag,
          conversations: rawConversations,
          contactUids: contacts.map((c) => c.contactUid),
        });
        return { ok: true, createdId };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Gagal menerbitkan status.',
        };
      }
    },
    [firebaseUser, displayName, rawConversations, contacts]
  );

  const markStatusViewed = useCallback(
    async (statusId: string) => {
      if (!firebaseUser) return;
      await markFirestoreStatusViewed(
        statusId,
        firebaseUser.uid,
        displayName || firebaseUser.displayName || 'Pengguna'
      );
    },
    [firebaseUser, displayName]
  );

  const deleteStatus = useCallback(async (statusId: string) => {
    await deleteFirestoreStatus(statusId);
  }, []);

  const revokeDevice = useCallback(
    async (deviceId: string) => {
      if (!firebaseUser) return;
      await removeUserDevice(firebaseUser.uid, deviceId);
    },
    [firebaseUser]
  );

  const saveSettings = useCallback(
    async (params: { displayName?: string; settings: Partial<AppSettings> }) => {
      if (!firebaseUser) return { ok: false, message: 'Belum masuk akun.' };
      await updateUserPrivateSettings(firebaseUser.uid, {
        ...params,
        phoneNumber,
      });
      if (params.displayName) setDisplayName(params.displayName);
      setSettings((prev) => ({ ...prev, ...params.settings }));
      return {
        ok: true,
        message: 'Pengaturan Handrawina disimpan permanen ke akun cloud Anda.',
      };
    },
    [firebaseUser, phoneNumber]
  );

  const resetSettings = useCallback(async () => {
    if (!firebaseUser) return;
    await updateUserPrivateSettings(firebaseUser.uid, {
      phoneNumber,
      settings: DEFAULT_APP_SETTINGS,
    });
    setSettings({ ...DEFAULT_APP_SETTINGS });
  }, [firebaseUser, phoneNumber]);

  const logCall = useCallback(
    async (params: Omit<CallRecord, 'id' | 'startedAt'>) => {
      if (!firebaseUser) return;
      await logFirestoreCall(firebaseUser.uid, params);
    },
    [firebaseUser]
  );

  const getPeerUidForConversation = useCallback(
    (conversationId: string): string | undefined => {
      if (!firebaseUser) return undefined;
      const rec = rawConversations.find((c) => c.id === conversationId);
      if (!rec) return undefined;
      const peer = resolvePeerPerspective(rec, firebaseUser.uid);
      return peer.peerUid || undefined;
    },
    [rawConversations, firebaseUser]
  );

  const dismissIncomingCall = useCallback(() => {
    if (incomingCall) {
      dismissedCallRoomRef.current = incomingCall.roomCode;
    }
    setIncomingCall(null);
  }, [incomingCall]);

  const rejectIncomingCall = useCallback(async () => {
    if (!incomingCall) return { ok: false, error: 'Tidak ada panggilan masuk.' };
    try {
      await endCallRoom(incomingCall.roomCode);
      dismissedCallRoomRef.current = incomingCall.roomCode;
      setIncomingCall(null);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Gagal menolak panggilan.',
      };
    }
  }, [incomingCall]);

  return {
    authReady,
    firebaseUser,
    authError,
    clearAuthError,
    cloudBootstrapping,
    identityKey,
    account,
    settings,
    rawConversations,
    conversations,
    contacts,
    directoryVisible,
    unsavedPeerByConv,
    messagesByConv,
    devices,
    statuses,
    calls,
    typingByConv,
    incomingCall,
    dismissIncomingCall,
    rejectIncomingCall,
    signInPhone,
    registerPhone,
    signInGoogle,
    signOutUser,
    lookupPhone,
    searchUserDirectory,
    addDirectoryContact,
    setDirectoryVisibility,
    saveContactAndChat,
    openChatWithSavedContact,
    saveUnsavedPeerFromConv,
    deleteContact,
    mintQrToken,
    redeemQrCode,
    sendMessage,
    createConversation,
    rotateGroupEpoch,
    setTyping,
    markConversationRead,
    createStatus,
    markStatusViewed,
    deleteStatus,
    revokeDevice,
    saveSettings,
    resetSettings,
    logCall,
    getPeerUidForConversation,
  };
}
