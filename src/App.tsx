import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CircleDashed,
  Image as ImageIcon,
  MessageSquare,
  MoreVertical,
  Phone,
  PhoneIncoming,
  PhoneOff,
  PhoneOutgoing,
  QrCode,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import type {
  AccountProfile,
  AppSettings,
  AppWorkspaceTab,
  BusinessProduct,
  CallRecord,
  ChatMessage,
  Conversation,
  ConversationKind,
  PairedDevice,
  StatusAudience,
  StatusTheme,
  StatusUpdate,
} from './types/handrawina';
import { getTotalUnreadCount } from './utils/handrawinaState';
import { ChatWorkspace } from './components/app/ChatWorkspace';
import { CallsWorkspace, type ActiveCallSession } from './components/app/CallsWorkspace';
import { SecurityDevicesWorkspace } from './components/app/SecurityDevicesWorkspace';
import { StatusUpdatesWorkspace } from './components/app/StatusUpdatesWorkspace';
import { JoinBarcodeModal, type JoinBarcodeMode } from './components/app/JoinBarcodeModal';
import {
  OutgoingCallModal,
  type OutgoingCallLaunchParams,
} from './components/app/OutgoingCallModal';
import { SettingsWorkspace, type SettingsCategory } from './components/app/SettingsWorkspace';
import { CinematicBackdrop } from './components/app/CinematicBackdrop';
import { AkuAiEmblem } from './components/app/AkuAiEmblem';
import { AuthGateScreen } from './components/app/AuthGateScreen';
import { useFirebaseHandrawina } from './hooks/useFirebaseHandrawina';
import {
  DEFAULT_ICE_SERVERS,
  HandrawinaWebRtcSession,
  type WebRtcSignalingCallbacks,
} from './services/webrtcSignaling';
import { fetchTurnIceServers } from './services/turnCredentials';
import { parseHandrawinaJoinInput } from './utils/barcodeGenerator';
import { DEFAULT_APP_SETTINGS } from './utils/settingsAndDialer';
import { getNavbarThemeConfig } from './utils/navbarTheme';

interface EffectiveAppData {
  account: AccountProfile;
  settings: AppSettings;
  devices: PairedDevice[];
  conversations: Conversation[];
  messages: Record<string, ChatMessage[]>;
  calls: CallRecord[];
  statuses: StatusUpdate[];
  businessProducts: BusinessProduct[];
  iceConfig: {
    stunUrls: string[];
    turnUrl: string;
    relayRegion: string;
  };
}

const DEFAULT_ICE_CONFIG: EffectiveAppData['iceConfig'] = {
  stunUrls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
  turnUrl: 'Belum diperiksa; STUN saja',
  relayRegion: 'STUN saja',
};

const WORKSPACE_TABS: {
  id: AppWorkspaceTab;
  label: string;
  mobileLabel: string;
  icon: typeof MessageSquare;
}[] = [
  { id: 'status', label: 'Status', mobileLabel: 'Status', icon: CircleDashed },
  { id: 'calls', label: 'Telepon', mobileLabel: 'Telepon', icon: Phone },
  { id: 'security', label: 'Keamanan', mobileLabel: 'Keamanan', icon: ShieldCheck },
  { id: 'chats', label: 'Obrolan', mobileLabel: 'Obrolan', icon: MessageSquare },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<AppWorkspaceTab>('chats');
  const [activeConvId, setActiveConvId] = useState<string>('');
  const [activeCall, setActiveCall] = useState<ActiveCallSession | null>(null);
  const [groupCallActive, setGroupCallActive] = useState(false);
  const activeCallRef = useRef(activeCall);
  activeCallRef.current = activeCall;
  const [joinModalOpen, setJoinModalOpen] = useState<boolean>(false);
  const [joinModalMode, setJoinModalMode] = useState<JoinBarcodeMode>('invite');
  const [outgoingCallModalOpen, setOutgoingCallModalOpen] = useState<boolean>(false);
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory>('profile');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [akuAiOpen, setAkuAiOpen] = useState<boolean>(false);
  const [akuAiInitialPrompt, setAkuAiInitialPrompt] = useState<string | null>(null);
  const [backdropPreview, setBackdropPreview] = useState<{
    backdropPreset: AppSettings['backdropPreset'];
    backdropIntensity: AppSettings['backdropIntensity'];
    backdropMotion: boolean;
    navbarTheme: AppSettings['navbarTheme'];
  } | null>(null);
  const [pendingQrCode, setPendingQrCode] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const rawParam = params.get('call') ?? params.get('join') ?? params.get('pair');
    if (rawParam) {
      const parsed = parseHandrawinaJoinInput(rawParam);
      window.history.replaceState({}, '', window.location.pathname);
      if (parsed.kind !== 'invalid') {
        return parsed.code;
      }
    }
    return null;
  });
  const [cloudBannerNotice, setCloudBannerNotice] = useState<string | null>(null);

  // Real WebRTC P2P signaling session state
  const webrtcSessionRef = useRef<HandrawinaWebRtcSession | null>(null);
  const connectedAtRef = useRef<number | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [webrtcStatus, setWebrtcStatus] = useState<string | null>(null);
  const [callConnected, setCallConnected] = useState(false);
  const [runtimeIceConfig, setRuntimeIceConfig] = useState(DEFAULT_ICE_CONFIG);

  const cloud = useFirebaseHandrawina(activeConvId);
  const isCloudMultiUser = Boolean(cloud.firebaseUser && cloud.account);
  const failedRoomRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      const session = webrtcSessionRef.current;
      webrtcSessionRef.current = null;
      if (session) {
        void session.endCall(true).catch((error) => {
          console.error('Failed to close WebRTC call on application exit:', error);
        });
      }
    },
    []
  );

  const handleCallFailure = useCallback((message: string) => {
    const roomCode = activeCallRef.current?.roomCode;
    if (!roomCode || failedRoomRef.current === roomCode) return;
    failedRoomRef.current = roomCode;
    activeCallRef.current = null;
    const session = webrtcSessionRef.current;
    webrtcSessionRef.current = null;
    if (session) {
      void session.endCall(true).catch((error) => {
        console.error('Failed to close WebRTC call after setup failure:', error);
      });
    }
    connectedAtRef.current = null;
    setActiveCall(null);
    setCallConnected(false);
    setRemoteStream(null);
    setWebrtcStatus(null);
    setCloudBannerNotice(message);
    window.setTimeout(() => setCloudBannerNotice(null), 8000);
  }, []);

  // Synchronize activeConvId with real Firestore conversations when logged in
  useEffect(() => {
    if (!isCloudMultiUser) return;
    if (cloud.conversations.length === 0) return;
    if (!cloud.conversations.some((c) => c.id === activeConvId)) {
      setActiveConvId(cloud.conversations[0].id);
    }
  }, [isCloudMultiUser, cloud.conversations, activeConvId]);

  // Cloud data is authoritative; features without cloud storage remain empty until implemented.
  const effectiveSnapshot: EffectiveAppData | null = useMemo(() => {
    if (!isCloudMultiUser || !cloud.account) return null;
    return {
      account: cloud.account,
      settings: cloud.settings,
      devices: cloud.devices,
      conversations: cloud.conversations,
      messages: cloud.messagesByConv,
      calls: cloud.calls,
      statuses: cloud.statuses,
      businessProducts: [],
      iceConfig: runtimeIceConfig,
    };
  }, [
    isCloudMultiUser,
    cloud.account,
    cloud.settings,
    cloud.devices,
    cloud.conversations,
    cloud.messagesByConv,
    cloud.calls,
    cloud.statuses,
    runtimeIceConfig,
  ]);

  const effectiveFingerprint = cloud.identityKey?.fingerprintHex ?? '';
  const effectiveTypingByConv = cloud.typingByConv;

  const handleSelectConversation = useCallback(
    (id: string) => {
      setActiveConvId(id);
      cloud.markConversationRead(id);
    },
    [cloud.markConversationRead]
  );

  const handleSendMessage = useCallback(
    async (params: {
      conversationId: string;
      plaintext: string;
      kind?: ChatMessage['kind'];
      voiceDurationSec?: number;
      mediaLabel?: string;
      mediaSizeKb?: number;
      product?: ChatMessage['product'];
    }) => {
      await cloud.sendMessage({
        conversationId: params.conversationId,
        plaintext: params.plaintext,
        kind: params.kind,
        voiceDurationSec: params.voiceDurationSec,
        mediaLabel: params.mediaLabel,
        mediaSizeKb: params.mediaSizeKb,
      });
    },
    [cloud.sendMessage]
  );

  const handleTypingChange = useCallback(
    (conversationId: string, isTyping: boolean) => {
      cloud.setTyping(conversationId, isTyping);
    },
    [cloud.setTyping]
  );

  const handleCreateConversation = async (params: {
    name: string;
    kind: ConversationKind;
    participantCount?: number;
    memberUids?: string[];
  }) => {
    const createdId = await cloud.createConversation({
      name: params.name,
      kind: params.kind,
      memberUids: params.memberUids,
    });
    if (createdId) {
      setActiveConvId(createdId);
    }
  };

  const handleRotateGroupEpoch = async (conversationId: string) => {
    await cloud.rotateGroupEpoch(conversationId);
  };

  const handleOpenJoinBarcode = useCallback((mode: JoinBarcodeMode) => {
    setJoinModalMode(mode);
    setJoinModalOpen(true);
    setMobileMenuOpen(false);
  }, []);

  const handleOpenAkuAi = useCallback((initialPrompt?: string) => {
    if (initialPrompt && initialPrompt.trim()) {
      setAkuAiInitialPrompt(initialPrompt.trim());
    }
    setActiveTab('chats');
    setAkuAiOpen(true);
    setMobileMenuOpen(false);
  }, []);

  const handleLaunchOutgoingCall = useCallback(
    (params: OutgoingCallLaunchParams) => {
      const roomSuffix = Math.random().toString(16).slice(2, 8).toUpperCase();
      const roomCode = `HND-VID-${roomSuffix}`;
      const targetConv = params.conversation;
      if (targetConv.kind !== 'direct') return;
      if (activeCallRef.current || groupCallActive) {
        setCloudBannerNotice('Akhiri panggilan yang sedang berlangsung sebelum memulai panggilan baru.');
        return;
      }
      if (!cloud.getPeerUidForConversation(targetConv.id)) {
        setCloudBannerNotice('Kontak ini belum memiliki akun cloud yang dapat dipanggil.');
        window.setTimeout(() => setCloudBannerNotice(null), 8000);
        return;
      }

      failedRoomRef.current = null;
      connectedAtRef.current = null;
      setCallConnected(false);
      setWebrtcStatus('Meminta izin mikrofon dan kamera...');
      setActiveCall({
        roomCode,
        conversation: targetConv,
        mode: params.mode,
        topology: 'P2P-DTLS-SRTP',
        participants: [effectiveSnapshot?.account.displayName ?? 'Anda', targetConv.name],
        direction: 'outgoing',
      });
      setActiveTab('calls');
    },
    [cloud.getPeerUidForConversation, effectiveSnapshot?.account.displayName, groupCallActive]
  );

  const handleStartCall = (conversation: Conversation, mode: 'audio' | 'video') => {
    handleLaunchOutgoingCall({
      conversation,
      mode,
    });
  };

  const handleJoinCallByCode = useCallback(
    (roomCode: string, modeOverride: 'audio' | 'video' = 'video', hostName = 'Host Handrawina') => {
      const normalized = roomCode.trim().toUpperCase();
      if (activeCallRef.current || groupCallActive) {
        setCloudBannerNotice('Akhiri panggilan yang sedang berlangsung sebelum bergabung ke panggilan lain.');
        return;
      }
      failedRoomRef.current = null;
      connectedAtRef.current = null;
      setCallConnected(false);
      setWebrtcStatus('Meminta izin mikrofon dan kamera...');
      setActiveCall((prev) => {
        if (prev && prev.roomCode === normalized) return prev;
        const syntheticRoomConv: Conversation = {
          id: `room-${normalized.toLowerCase()}`,
          name: hostName !== 'Host Handrawina' ? hostName : `Ruang Panggilan · ${normalized}`,
          handle: 'WebRTC P2P DTLS-SRTP',
          kind: 'direct',
          initials: 'VC',
          unreadCount: 0,
          lastActiveText: 'Panggilan berlangsung',
          online: true,
          participantCount: 2,
          peerPublicKeyFingerprint: '',
          labels: [],
        };
        return {
          roomCode: normalized,
          conversation: syntheticRoomConv,
          mode: modeOverride,
          topology: 'P2P-DTLS-SRTP',
          participants: [effectiveSnapshot?.account.displayName ?? 'Anda', hostName],
          direction: 'incoming',
        };
      });
      setActiveTab('calls');
    },
    [effectiveSnapshot?.account.displayName, groupCallActive]
  );

  // Wire real Firestore WebRTC P2P signaling whenever CallsWorkspace provides local media stream
  const handleLocalStreamReady = useCallback(
    async (localStream: MediaStream) => {
      const call = activeCallRef.current;
      if (!isCloudMultiUser || !cloud.firebaseUser || !call) return;
      const user = cloud.firebaseUser;
      const myName = cloud.account?.displayName ?? user.displayName ?? 'Pengguna Handrawina';

      setWebrtcStatus('Menyiapkan koneksi WebRTC...');
      const iceServers = [...DEFAULT_ICE_SERVERS];
      try {
        const turnServers = await fetchTurnIceServers(await user.getIdToken());
        iceServers.push(...turnServers);
        setRuntimeIceConfig({
          stunUrls: DEFAULT_ICE_CONFIG.stunUrls,
          turnUrl: 'TURN aktif',
          relayRegion: 'STUN + TURN',
        });
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : 'kredensial TURN tidak tersedia';
        setRuntimeIceConfig({
          stunUrls: DEFAULT_ICE_CONFIG.stunUrls,
          turnUrl: `STUN saja (${detail})`,
          relayRegion: 'STUN saja',
        });
      }

      if (activeCallRef.current?.roomCode !== call.roomCode) return;
      void webrtcSessionRef.current?.endCall(false).catch((error) => {
        console.error('Failed to close previous WebRTC session:', error);
      });
      const role = call.direction === 'incoming' ? 'callee' : 'caller';
      const session = new HandrawinaWebRtcSession(call.roomCode, role, iceServers);
      webrtcSessionRef.current = session;
      setRemoteStream(null);
      setWebrtcStatus(role === 'caller' ? 'Menunggu rekan bergabung...' : 'Menyambungkan P2P...');

      const callbacks: WebRtcSignalingCallbacks = {
        onRemoteStream: (stream: MediaStream) => {
          setRemoteStream(stream);
        },
        onPeerConnected: (peerName: string) => {
          setActiveCall((prev) =>
            prev
              ? {
                  ...prev,
                  participants: [prev.participants[0] ?? myName, peerName],
                }
              : prev
          );
        },
        onConnectionStateChange: (state: string) => {
          const map: Record<string, string> = {
            new: 'Menyiapkan ICE',
            connecting: 'Menyambungkan P2P...',
            connected: 'Tersambung Live P2P',
            disconnected: 'Koneksi Terputus Sementara',
            failed: 'Koneksi ICE gagal',
            closed: 'Selesai',
          };
          setWebrtcStatus(map[state] ?? state);
          if (state === 'connected') {
            if (connectedAtRef.current === null) connectedAtRef.current = Date.now();
            setCallConnected(true);
          }
        },
        onTransportTypeChange: (topology) => {
          setActiveCall((prev) => (prev ? { ...prev, topology } : prev));
        },
        onCallEndedRemotely: () => {
          const endedCall = activeCallRef.current;
          const connectedAt = connectedAtRef.current;
          const durationSec = connectedAt
            ? Math.max(1, Math.floor((Date.now() - connectedAt) / 1000))
            : 0;
          const currentSession = webrtcSessionRef.current;
          webrtcSessionRef.current = null;
          activeCallRef.current = null;
          connectedAtRef.current = null;
          void currentSession?.endCall(false);
          setRemoteStream(null);
          setWebrtcStatus(null);
          setCallConnected(false);
          setActiveCall(null);
          if (endedCall && durationSec > 0) {
            void cloud
              .logCall({
                conversationId: endedCall.conversation.id,
                peerName: endedCall.conversation.name,
                mode: endedCall.mode,
                topology: endedCall.topology,
                participants: endedCall.participants,
                durationSec,
                direction: endedCall.direction ?? 'outgoing',
              })
              .catch((error) => console.error('Failed to save call history:', error));
          }
        },
        onCallError: handleCallFailure,
      };

      if (role === 'caller') {
        const targetPeerUid = cloud.getPeerUidForConversation(call.conversation.id);
        if (!targetPeerUid) {
          handleCallFailure('Kontak ini tidak memiliki akun cloud yang dapat dipanggil.');
          return;
        }
        void session
          .startAsHost({
            hostUid: user.uid,
            hostName: myName,
            targetPeerUid,
            conversationId: call.conversation.id,
            mode: call.mode,
            protectIpViaTurn: false,
            localStream,
            callbacks,
          })
          .catch((error) =>
            handleCallFailure(
              error instanceof Error ? error.message : 'Gagal memulai signaling panggilan.'
            )
          );
      } else {
        void session
          .joinAsCallee({
            calleeUid: user.uid,
            calleeName: myName,
            localStream,
            callbacks,
          })
          .then((res) => {
            if (!res.ok && res.error) {
              handleCallFailure(res.error);
            }
          })
          .catch((error) =>
            handleCallFailure(
              error instanceof Error ? error.message : 'Gagal bergabung ke panggilan.'
            )
          );
      }
    },
    [
      isCloudMultiUser,
      cloud.firebaseUser,
      cloud.account?.displayName,
      cloud.logCall,
      cloud.getPeerUidForConversation,
      handleCallFailure,
    ]
  );

  // Redeem a QR deep link after the cloud account has finished bootstrapping.
  useEffect(() => {
    if (!pendingQrCode || !isCloudMultiUser || cloud.cloudBootstrapping) return;
    const codeToRedeem = pendingQrCode;
    setPendingQrCode(null);
    void cloud.redeemQrCode({ code: codeToRedeem }).then((res) => {
      setCloudBannerNotice(res.message);
      window.setTimeout(() => setCloudBannerNotice(null), 6500);
      if (!res.ok) return;
      if (res.mode === 'call' && res.callRoomCode) {
        handleJoinCallByCode(res.callRoomCode);
      } else if (res.mode === 'invite' && res.conversationId) {
        setActiveConvId(res.conversationId);
        setActiveTab('chats');
      } else if (res.mode === 'pair') {
        setActiveTab('security');
      }
    });
  }, [
    pendingQrCode,
    isCloudMultiUser,
    cloud.cloudBootstrapping,
    cloud.redeemQrCode,
    handleJoinCallByCode,
  ]);

  const handleEndCall = async (durationSec: number) => {
    const endedCall = activeCallRef.current;
    if (!endedCall) return;
    const shouldLogCall = connectedAtRef.current !== null;
    activeCallRef.current = null;
    setActiveCall(null);
    setRemoteStream(null);
    setWebrtcStatus(null);
    setCallConnected(false);
    connectedAtRef.current = null;
    if (webrtcSessionRef.current) {
      const s = webrtcSessionRef.current;
      webrtcSessionRef.current = null;
      try {
        await s.endCall(true);
      } catch (error) {
        setCloudBannerNotice(
          error instanceof Error ? `Panggilan berakhir, tetapi status cloud gagal diperbarui: ${error.message}` : 'Panggilan berakhir, tetapi status cloud gagal diperbarui.'
        );
      }
    }

    if (shouldLogCall) {
      try {
        await cloud.logCall({
          conversationId: endedCall.conversation.id,
          peerName: endedCall.conversation.name,
          mode: endedCall.mode,
          topology: endedCall.topology,
          participants: endedCall.participants,
          durationSec: Math.max(1, durationSec),
          direction: endedCall.direction ?? 'outgoing',
        });
      } catch (error) {
        setCloudBannerNotice(
          error instanceof Error ? `Riwayat panggilan gagal disimpan: ${error.message}` : 'Riwayat panggilan gagal disimpan.'
        );
      }
    }
  };

  const handleReplyToStatus = useCallback(
    async (params: { status: StatusUpdate; replyText: string }) => {
      const targetConvId =
        params.status.conversationId ??
        effectiveSnapshot?.conversations.find((c) => c.name === params.status.authorName)?.id ??
        effectiveSnapshot?.conversations[0]?.id;
      if (!targetConvId) return;
      await handleSendMessage({
        conversationId: targetConvId,
        plaintext: `[Balasan Status "${params.status.text.slice(0, 48)}${
          params.status.text.length > 48 ? '...' : ''
        }"] ${params.replyText}`,
        kind: 'text',
      });
    },
    [effectiveSnapshot?.conversations, handleSendMessage]
  );

  const handleMarkStatusViewed = useCallback(
    async (statusId: string) => {
      await cloud.markStatusViewed(statusId);
    },
    [cloud.markStatusViewed]
  );

  const totalUnreadChats = useMemo(
    () => (effectiveSnapshot ? getTotalUnreadCount(effectiveSnapshot.conversations) : 0),
    [effectiveSnapshot]
  );

  const hasUnviewedStatuses = useMemo(
    () =>
      (effectiveSnapshot?.statuses ?? []).some(
        (s) =>
          s.authorId !== 'self' &&
          s.authorId !== effectiveSnapshot?.account.accountId &&
          !s.viewedByMe
      ),
    [effectiveSnapshot?.statuses, effectiveSnapshot?.account.accountId]
  );

  const effectiveBackdrop = backdropPreview ?? {
    backdropPreset: effectiveSnapshot?.settings.backdropPreset ?? DEFAULT_APP_SETTINGS.backdropPreset,
    backdropIntensity:
      effectiveSnapshot?.settings.backdropIntensity ?? DEFAULT_APP_SETTINGS.backdropIntensity,
    backdropMotion: effectiveSnapshot?.settings.backdropMotion ?? DEFAULT_APP_SETTINGS.backdropMotion,
    navbarTheme: effectiveSnapshot?.settings.navbarTheme ?? DEFAULT_APP_SETTINGS.navbarTheme,
  };

  const navTheme = getNavbarThemeConfig(effectiveBackdrop.navbarTheme);

  // Wait for Firebase auth and the authenticated cloud profile before rendering workspaces.
  if (!cloud.authReady || (cloud.firebaseUser && cloud.cloudBootstrapping)) {
    return (
      <div className="min-h-screen relative flex items-center justify-center p-6 text-stone-100">
        <CinematicBackdrop
          presetId={effectiveBackdrop.backdropPreset}
          intensity={effectiveBackdrop.backdropIntensity}
          motionEnabled={effectiveBackdrop.backdropMotion}
        />
        <div className="relative z-10 px-5 py-3 bg-stone-950/75 backdrop-blur-xl border border-amber-200/20 rounded-lg text-sm font-medium text-stone-200">
          Menyiapkan autentikasi &amp; kunci E2EE Handrawina...
        </div>
      </div>
    );
  }

  if (!cloud.firebaseUser) {
    return (
      <AuthGateScreen
        pendingQrCode={pendingQrCode}
        authLoading={cloud.cloudBootstrapping}
        authError={cloud.authError}
        onClearAuthError={cloud.clearAuthError}
        backdropSettings={effectiveBackdrop}
        onPhoneSignIn={cloud.signInPhone}
        onPhoneRegister={cloud.registerPhone}
      />
    );
  }

  if (cloud.authError && !effectiveSnapshot) {
    return (
      <div className="min-h-screen relative flex items-center justify-center p-6 text-stone-100">
        <CinematicBackdrop
          presetId={effectiveBackdrop.backdropPreset}
          intensity={effectiveBackdrop.backdropIntensity}
          motionEnabled={effectiveBackdrop.backdropMotion}
        />
        <div className="relative z-10 max-w-md w-full bg-stone-950/80 backdrop-blur-xl border border-amber-200/20 rounded-xl p-6 text-center space-y-3 shadow-2xl">
          <h1 className="text-lg font-display font-bold text-stone-50">
            Gagal Menyiapkan Akun Cloud
          </h1>
          <p className="text-sm text-stone-300">{cloud.authError}</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => void cloud.signOutUser()}
              className="px-4 py-2 text-xs font-semibold text-[#071329] bg-gradient-to-r from-[#FFEDD5] via-[#FDBA74] to-[#FB923C] hover:brightness-105 rounded-md cursor-pointer transition-all"
            >
              Kembali ke Login
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-xs font-medium text-stone-200 bg-stone-800 hover:bg-stone-700 rounded-md cursor-pointer transition-colors"
            >
              Muat Ulang
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!effectiveSnapshot) {
    return (
      <div className="min-h-screen relative flex items-center justify-center p-6 text-stone-100">
        <CinematicBackdrop
          presetId={effectiveBackdrop.backdropPreset}
          intensity={effectiveBackdrop.backdropIntensity}
          motionEnabled={effectiveBackdrop.backdropMotion}
        />
        <div className="relative z-10 px-5 py-3 bg-stone-950/75 backdrop-blur-xl border border-amber-200/20 rounded-lg text-sm font-medium text-stone-200">
          Menyiapkan sesi cloud Handrawina...
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-transparent text-stone-100 overflow-hidden relative">
      {/* Full-Bleed Cinematic & Luxury Architectural Background */}
      <CinematicBackdrop
        presetId={effectiveBackdrop.backdropPreset}
        intensity={effectiveBackdrop.backdropIntensity}
        motionEnabled={effectiveBackdrop.backdropMotion}
      />

      {/* Top Bar: 4-Color Luxury Theme (Biru Dongker / Emas Sampanye / Orange Light / Perunggu Senja) */}
      <header
        data-testid="app-top-navbar"
        data-navbar-theme={navTheme.id}
        className={`relative z-30 h-14 sm:h-16 backdrop-blur-md shrink-0 transition-colors ${navTheme.headerClass}`}
      >
        <div className="max-w-[1440px] mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4 md:gap-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('chats')}
            className={`text-[21px] sm:text-xl font-display font-bold tracking-tight transition-colors whitespace-nowrap shrink-0 cursor-pointer ${navTheme.brandClass}`}
          >
            Handrawina
          </button>

          {/* Zone 2: 5 concise single-line navigation links (Desktop, exact requested order) */}
          <nav
            aria-label="Navigasi aplikasi Handrawina"
            className="hidden md:flex items-center gap-6 text-sm font-medium"
          >
            {WORKSPACE_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative py-1 border-b-2 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive ? navTheme.navActiveClass : navTheme.navInactiveClass
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.id === 'chats' && totalUnreadChats > 0 && (
                    <span
                      className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold inline-flex items-center justify-center tabular-nums ${navTheme.unreadBadgeClass}`}
                    >
                      {totalUnreadChats}
                    </span>
                  )}
                  {tab.id === 'status' && hasUnviewedStatuses && (
                    <span
                      className={`w-2 h-2 rounded-full ${navTheme.statusDotClass}`}
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3 (Desktop): Aku AI + Camera/QR + Settings + Primary Outgoing Call */}
          <div className="hidden md:flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleOpenAkuAi()}
              aria-label="Buka asisten Aku AI"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                akuAiOpen && activeTab === 'chats'
                  ? navTheme.akuAiActiveClass
                  : navTheme.akuAiIdleClass
              }`}
            >
              <AkuAiEmblem size="xs" />
              <span>Aku AI</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenJoinBarcode('invite')}
              aria-label="Kamera dan Barcode Gabung Handrawina"
              className={`p-2 rounded-full transition-colors cursor-pointer ${navTheme.iconBtnClass}`}
            >
              <Camera className="w-4 h-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              aria-label="Pengaturan Handrawina"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'settings'
                  ? navTheme.settingsActiveClass
                  : navTheme.settingsIdleClass
              }`}
            >
              <Settings className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Pengaturan</span>
            </button>

            {activeCall ? (
              <button
                type="button"
                onClick={() => setActiveTab('calls')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap shrink-0 cursor-pointer transition-all ${navTheme.primaryCtaClass}`}
              >
                <PhoneOutgoing className="w-3.5 h-3.5" aria-hidden="true" />
                Kembali ke Panggilan
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setOutgoingCallModalOpen(true)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap shrink-0 cursor-pointer transition-all ${navTheme.primaryCtaClass}`}
              >
                <PhoneOutgoing className="w-3.5 h-3.5" aria-hidden="true" />
                Panggilan Keluar
              </button>
            )}
          </div>

          {/* Zone 3 (Mobile): Camera + 3-Dot Overflow Menu */}
          <div className="flex md:hidden items-center gap-1 shrink-0 relative">
            <button
              type="button"
              onClick={() => handleOpenJoinBarcode('invite')}
              aria-label="Kamera dan pindai QR Handrawina"
              className={`p-2.5 rounded-full min-h-[42px] min-w-[42px] flex items-center justify-center cursor-pointer transition-colors ${navTheme.mobileHeaderBtnClass}`}
            >
              <Camera className="w-5 h-5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Menu lainnya"
              aria-expanded={mobileMenuOpen}
              className={`p-2.5 rounded-full min-h-[42px] min-w-[42px] flex items-center justify-center cursor-pointer transition-colors ${navTheme.mobileHeaderBtnClass}`}
            >
              <MoreVertical className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Overflow Menu (rendered outside header backdrop-blur so full-screen backdrop works cleanly) */}
      {mobileMenuOpen && (
        <div className="md:hidden">
          <div
            className="fixed inset-0 z-40"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div
            role="menu"
            className={`fixed right-4 top-14 z-50 w-52 py-1.5 rounded-2xl border shadow-[0_16px_44px_rgba(0,0,0,0.65)] text-sm ${navTheme.overflowMenuClass}`}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => handleOpenAkuAi()}
              className={`w-full px-4 py-2.5 text-left flex items-center gap-2.5 cursor-pointer ${navTheme.overflowMenuItemHoverClass}`}
            >
              <AkuAiEmblem size="xs" />
              <span className="font-medium text-amber-200">Tanya Aku AI</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMobileMenuOpen(false);
                setOutgoingCallModalOpen(true);
              }}
              className={`w-full px-4 py-2.5 text-left flex items-center gap-2.5 cursor-pointer ${navTheme.overflowMenuItemHoverClass}`}
            >
              <PhoneOutgoing className={`w-4 h-4 shrink-0 ${navTheme.overflowCallIconClass}`} />
              <span>Panggilan Keluar</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => handleOpenJoinBarcode('invite')}
              className={`w-full px-4 py-2.5 text-left flex items-center gap-2.5 cursor-pointer ${navTheme.overflowMenuItemHoverClass}`}
            >
              <QrCode className="w-4 h-4 text-amber-200/80 shrink-0" />
              <span>Barcode & QR Gabung</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMobileMenuOpen(false);
                setSettingsCategory('appearance');
                setActiveTab('settings');
              }}
              className={`w-full px-4 py-2.5 text-left flex items-center gap-2.5 cursor-pointer ${navTheme.overflowMenuItemHoverClass}`}
            >
              <ImageIcon className="w-4 h-4 text-amber-300 shrink-0" />
              <span>Tampilan & Navbar</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMobileMenuOpen(false);
                setActiveTab('settings');
              }}
              className={`w-full px-4 py-2.5 text-left flex items-center gap-2.5 cursor-pointer ${navTheme.overflowMenuItemHoverClass}`}
            >
              <Settings className="w-4 h-4 text-slate-300 shrink-0" />
              <span>Pengaturan</span>
            </button>
          </div>
        </div>
      )}

      {/* Live Incoming WebRTC Call Banner (Multi-User Cloud) */}
      {isCloudMultiUser && cloud.incomingCall && !activeCall && !groupCallActive && (
        <div
          role="alert"
          data-testid="incoming-call-banner"
          className="relative z-30 bg-[#3A2B14]/95 border-b border-[#FDBA74]/45 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-xl"
        >
          <div className="flex items-center gap-2.5 text-xs sm:text-sm text-amber-50">
            <PhoneIncoming className="w-4 h-4 text-[#FDBA74] animate-pulse shrink-0" aria-hidden="true" />
            <span>
              <strong>{cloud.incomingCall.hostName}</strong> memanggil Anda (
              {cloud.incomingCall.mode === 'video' ? 'Video Call WebRTC' : 'Panggilan Suara'}) ·{' '}
              <span className="font-mono text-[#FDBA74]">{cloud.incomingCall.roomCode}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const incoming = cloud.incomingCall;
                if (!incoming) return;
                cloud.dismissIncomingCall();
                handleJoinCallByCode(incoming.roomCode, incoming.mode, incoming.hostName);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-stone-950 bg-[#FDBA74] hover:bg-amber-300 rounded-full cursor-pointer transition-colors"
            >
              <Phone className="w-3.5 h-3.5" aria-hidden="true" />
              Terima
            </button>
            <button
              type="button"
              onClick={() => {
                void cloud.rejectIncomingCall().then((result) => {
                  if (!result.ok && result.error) {
                    setCloudBannerNotice(result.error);
                  }
                });
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-200 bg-red-950/75 hover:bg-red-900/80 border border-red-400/35 rounded-full cursor-pointer transition-colors"
            >
              <PhoneOff className="w-3.5 h-3.5" aria-hidden="true" />
              Tolak
            </button>
          </div>
        </div>
      )}

      {/* QR Pairing Feedback Toast Banner */}
      {cloudBannerNotice && (
        <div
          role="status"
          className="relative z-30 bg-[#0A1833]/95 border-b border-[#FDBA74]/35 px-4 sm:px-6 py-2 text-xs text-amber-100 flex items-center justify-between gap-3"
        >
          <span>{cloudBannerNotice}</span>
          <button
            type="button"
            onClick={() => setCloudBannerNotice(null)}
            className="text-amber-300 hover:underline cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Main Workspace Area: Architectural Glass Shell Framed Over Cinematic Backdrop */}
      <main className="relative z-10 flex-1 min-h-0 flex flex-col max-w-[1440px] w-full mx-auto overflow-hidden pb-16 md:pb-4 md:px-5 md:pt-4">
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden md:rounded-2xl md:border md:border-white/12 md:shadow-[0_24px_80px_rgba(0,0,0,0.68)]">
        {activeTab === 'chats' && (
          <ChatWorkspace
            account={effectiveSnapshot.account}
            localFingerprint={effectiveFingerprint}
            conversations={effectiveSnapshot.conversations}
            messagesByConv={effectiveSnapshot.messages}
            activeConvId={activeConvId}
            onSelectConversation={handleSelectConversation}
            onSendMessage={handleSendMessage}
            onCreateConversation={handleCreateConversation}
            onRotateGroupEpoch={handleRotateGroupEpoch}
            onTypingChange={handleTypingChange}
            typingByConv={effectiveTypingByConv}
            onStartCall={handleStartCall}
            onOpenJoinBarcode={handleOpenJoinBarcode}
            onOpenBackdropSettings={() => {
              setSettingsCategory('appearance');
              setActiveTab('settings');
            }}
            businessProducts={effectiveSnapshot.businessProducts}
            contacts={cloud.contacts}
            unsavedPeer={cloud.unsavedPeerByConv[activeConvId] ?? null}
            onLookupPhone={cloud.lookupPhone}
            onSaveContactAndChat={cloud.saveContactAndChat}
            onOpenChatWithContact={cloud.openChatWithSavedContact}
            onSaveUnsavedPeer={(conversationId, contactName) =>
              cloud.saveUnsavedPeerFromConv({ conversationId, contactName })
            }
            onDeleteContact={cloud.deleteContact}
            akuAiOpen={akuAiOpen}
            akuAiInitialPrompt={akuAiInitialPrompt}
            onOpenAkuAi={handleOpenAkuAi}
            onCloseAkuAi={() => setAkuAiOpen(false)}
            onConsumeAkuAiPrompt={() => setAkuAiInitialPrompt(null)}
          />
        )}

        <div
          className={
            activeTab === 'calls' ? 'flex-1 min-h-0 flex flex-col' : 'hidden'
          }
        >
          <CallsWorkspace
            conversations={effectiveSnapshot.conversations}
            callRecords={effectiveSnapshot.calls}
            iceConfig={effectiveSnapshot.iceConfig}
            activeCall={activeCall}
            callConnected={callConnected}
            remoteStream={remoteStream}
            webrtcStatus={webrtcStatus}
            onLocalStreamReady={handleLocalStreamReady}
            onCallSetupError={handleCallFailure}
            onReplaceVideoTrack={(track) => webrtcSessionRef.current?.replaceVideoTrack(track)}
            onStartCall={handleStartCall}
            onJoinCallByCode={handleJoinCallByCode}
            onEndCall={handleEndCall}
            onOpenOutgoingCallModal={() => setOutgoingCallModalOpen(true)}
            contacts={cloud.contacts}
            firebaseUser={cloud.firebaseUser}
            displayName={effectiveSnapshot.account.displayName}
            onGroupCallActiveChange={setGroupCallActive}
          />
        </div>

        {activeTab === 'security' && (
          <SecurityDevicesWorkspace
            devices={effectiveSnapshot.devices}
            onOpenJoinBarcode={handleOpenJoinBarcode}
            onPairDevice={async (name, platform) => {
              const token = await cloud.mintQrToken('pair');
              const result = await cloud.redeemQrCode({
                code: token.code,
                memberName: `${name} (${platform})`,
              });
              if (!result.ok) throw new Error(result.message);
            }}
            onRevokeDevice={cloud.revokeDevice}
          />
        )}

        {activeTab === 'status' && (
          <StatusUpdatesWorkspace
            account={effectiveSnapshot.account}
            statuses={effectiveSnapshot.statuses ?? []}
            onCreateStatus={cloud.createStatus}
            onMarkViewed={handleMarkStatusViewed}
            onDeleteStatus={cloud.deleteStatus}
            onReplyToStatus={handleReplyToStatus}
            onOpenChat={(conversationId) => {
              handleSelectConversation(conversationId);
              setActiveTab('chats');
            }}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsWorkspace
            account={effectiveSnapshot.account}
            settings={effectiveSnapshot.settings}
            activeCategory={settingsCategory}
            onCategoryChange={setSettingsCategory}
            onPreviewBackdrop={setBackdropPreview}
            onOpenSecurityTab={() => setActiveTab('security')}
            onSignOut={cloud.signOutUser}
            onSaveSettings={async (params) => {
              const result = await cloud.saveSettings(params);
              setBackdropPreview(null);
              return result;
            }}
            onResetSettings={async () => {
              await cloud.resetSettings();
              setBackdropPreview(null);
            }}
          />
        )}
        </div>
      </main>

      {/* Mobile Touch-First Bottom Navigation Bar */}
      <nav
        aria-label="Navigasi bawah seluler Handrawina"
        className={`md:hidden fixed bottom-0 inset-x-0 z-30 h-16 backdrop-blur-md grid grid-cols-4 px-1 transition-colors ${navTheme.bottomNavClass}`}
      >
        {WORKSPACE_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className="flex flex-col items-center justify-center gap-1 min-h-[48px] transition-colors cursor-pointer"
            >
              <span
                className={`relative inline-flex items-center justify-center px-3.5 py-1 rounded-full transition-colors ${
                  isActive
                    ? navTheme.mobileActiveCapsuleClass
                    : navTheme.mobileInactiveIconClass
                }`}
              >
                <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
                {tab.id === 'chats' && totalUnreadChats > 0 && (
                  <span
                    className={`absolute -top-1 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center tabular-nums ${navTheme.unreadBadgeClass}`}
                  >
                    {totalUnreadChats}
                  </span>
                )}
                {tab.id === 'status' && hasUnviewedStatuses && (
                  <span
                    className={`absolute -top-0.5 right-1.5 w-2.5 h-2.5 rounded-full border-2 ${navTheme.statusDotClass} ${navTheme.mobileDotBorderClass}`}
                    aria-hidden="true"
                  />
                )}
                {tab.id === 'calls' && (activeCall || groupCallActive) && (
                  <span
                    className={`absolute -top-0.5 right-1.5 w-2.5 h-2.5 rounded-full border-2 ${navTheme.statusDotClass} ${navTheme.mobileDotBorderClass}`}
                    aria-hidden="true"
                  />
                )}
              </span>
              <span
                className={`text-[11px] leading-none truncate max-w-full px-0.5 ${
                  isActive ? navTheme.mobileActiveLabelClass : navTheme.mobileInactiveLabelClass
                }`}
              >
                {tab.mobileLabel}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Outgoing Call Contact Picker Modal */}
      <OutgoingCallModal
        open={outgoingCallModalOpen}
        conversations={effectiveSnapshot.conversations}
        onClose={() => setOutgoingCallModalOpen(false)}
        onLaunchOutgoingCall={handleLaunchOutgoingCall}
      />

      {/* Barcode & QR Code Join / Pairing / Video Call Modal */}
      <JoinBarcodeModal
        open={joinModalOpen}
        initialMode={joinModalMode}
        onMintToken={(mode) => cloud.mintQrToken(mode, activeCall?.roomCode ?? null)}
        onRedeemCode={cloud.redeemQrCode}
        onClose={() => setJoinModalOpen(false)}
        onRedeemSuccess={(res) => {
          if (res.mode === 'invite' && res.conversationId) {
            setActiveConvId(res.conversationId);
            setActiveTab('chats');
            setJoinModalOpen(false);
          } else if (res.mode === 'pair') {
            setActiveTab('security');
            setJoinModalOpen(false);
          } else if (res.mode === 'call' && res.callRoomCode) {
            handleJoinCallByCode(res.callRoomCode);
            setJoinModalOpen(false);
          }
        }}
      />
    </div>
  );
}
