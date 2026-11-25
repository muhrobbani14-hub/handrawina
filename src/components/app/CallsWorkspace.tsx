import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Camera,
  Lock,
  Mic,
  MicOff,
  MonitorUp,
  Phone,
  PhoneIncoming,
  PhoneOff,
  PhoneOutgoing,
  Users,
  Video,
  VideoOff,
} from 'lucide-react';
import type { CallRecord, Conversation } from '../../types/handrawina';
import type { SavedContactRecord } from '../../utils/phoneAuthAndContacts';
import { formatDuration } from '../../utils/handrawinaState';
import { parseHandrawinaJoinInput } from '../../utils/barcodeGenerator';
import { MeteredGroupCallTestPanel } from './MeteredGroupCallTestPanel';

export interface ActiveCallSession {
  roomCode: string;
  conversation: Conversation;
  mode: 'audio' | 'video';
  topology: CallRecord['topology'];
  participants: string[];
  direction?: 'outgoing' | 'incoming';
}

interface CallsWorkspaceProps {
  conversations: Conversation[];
  callRecords: CallRecord[];
  iceConfig: {
    stunUrls: string[];
    turnUrl: string;
    relayRegion: string;
  };
  activeCall: ActiveCallSession | null;
  onStartCall: (conversation: Conversation, mode: 'audio' | 'video') => void;
  onJoinCallByCode: (roomCode: string) => void;
  onEndCall: (durationSec: number) => Promise<void>;
  onOpenOutgoingCallModal: () => void;
  callConnected: boolean;
  remoteStream?: MediaStream | null;
  webrtcStatus?: string | null;
  onLocalStreamReady: (stream: MediaStream) => void;
  onCallSetupError: (message: string) => void;
  onReplaceVideoTrack?: (track: MediaStreamTrack | null) => void;
  contacts: SavedContactRecord[];
  firebaseUser: User | null;
  displayName: string;
  onGroupCallActiveChange: (active: boolean) => void;
}

export function CallsWorkspace({
  conversations,
  callRecords,
  iceConfig,
  activeCall,
  onStartCall,
  onJoinCallByCode,
  onEndCall,
  onOpenOutgoingCallModal,
  callConnected,
  remoteStream = null,
  webrtcStatus = null,
  onLocalStreamReady,
  onCallSetupError,
  onReplaceVideoTrack,
  contacts,
  firebaseUser,
  displayName,
  onGroupCallActiveChange,
}: CallsWorkspaceProps) {
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  // Real browser camera/screen media state
  const [hasLiveVideoTrack, setHasLiveVideoTrack] = useState(false);
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const onLocalStreamReadyRef = useRef(onLocalStreamReady);
  onLocalStreamReadyRef.current = onLocalStreamReady;
  const onCallSetupErrorRef = useRef(onCallSetupError);
  onCallSetupErrorRef.current = onCallSetupError;

  // Join call room by code form
  const [joinRoomInput, setJoinRoomInput] = useState('');
  const [joinRoomError, setJoinRoomError] = useState<string | null>(null);

  const stopAllMediaStreams = () => {
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    setHasLiveVideoTrack(false);
    setScreenSharing(false);
  };

  // Manage call timer and real WebRTC getUserMedia capture
  useEffect(() => {
    if (!activeCall) {
      stopAllMediaStreams();
      setElapsedSec(0);
      setMuted(false);
      setCameraOn(true);
      setMediaNotice(null);
      return;
    }

    let cancelled = false;
    const isVideoMode = activeCall.mode === 'video';
    setCameraOn(isVideoMode);
    setMediaNotice(null);

    async function initLocalMedia() {
      if (!window.isSecureContext) {
        if (!cancelled) {
          onCallSetupErrorRef.current(
            'Panggilan memerlukan koneksi aman. Gunakan localhost atau buka aplikasi melalui HTTPS.'
          );
        }
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) {
          onCallSetupErrorRef.current(
            'Akses mikrofon/kamera tidak tersedia. Gunakan localhost atau HTTPS pada browser yang mendukung WebRTC.'
          );
        }
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: isVideoMode
            ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
            : false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        cameraStreamRef.current = stream;
        const hasVideo = stream.getVideoTracks().length > 0;
        setHasLiveVideoTrack(hasVideo);
        if (localVideoRef.current && hasVideo) {
          localVideoRef.current.srcObject = stream;
        }
        onLocalStreamReadyRef.current(stream);
      } catch (error) {
        if (!cancelled) {
          const errorName =
            error && typeof error === 'object' && 'name' in error
              ? String(error.name)
              : '';
          const message =
            errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError'
              ? 'Izin mikrofon/kamera ditolak. Izinkan akses perangkat lalu mulai panggilan lagi.'
              : errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError'
              ? isVideoMode
                ? 'Mikrofon atau kamera tidak ditemukan. Sambungkan perangkat lalu coba lagi.'
                : 'Mikrofon tidak ditemukan. Sambungkan mikrofon lalu coba lagi.'
              : 'Tidak dapat membuka mikrofon/kamera. Periksa perangkat dan izin browser.';
          onCallSetupErrorRef.current(message);
        }
      }
    }

    initLocalMedia();

    return () => {
      cancelled = true;
      stopAllMediaStreams();
    };
  }, [activeCall?.roomCode, activeCall?.mode]);

  useEffect(() => {
    if (!activeCall || !callConnected) {
      setElapsedSec(0);
      return;
    }

    const timer = window.setInterval(() => {
      setElapsedSec((seconds) => seconds + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeCall?.roomCode, callConnected]);

  // Attach remote WebRTC stream whenever received from peer
  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, activeCall?.participants.length]);

  // Attach active stream to <video> element whenever cameraOn / screenSharing flips
  useEffect(() => {
    const activeStream = screenSharing ? screenStreamRef.current : cameraStreamRef.current;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = cameraOn || screenSharing ? activeStream : null;
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = !muted;
      });
      cameraStreamRef.current.getVideoTracks().forEach((t) => {
        t.enabled = cameraOn;
      });
    }
  }, [muted, cameraOn, screenSharing, hasLiveVideoTrack]);

  const handleToggleScreenShare = async () => {
    if (screenSharing) {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setScreenSharing(false);
      setMediaNotice(null);
      const camTrack = cameraStreamRef.current?.getVideoTracks()[0] ?? null;
      onReplaceVideoTrack?.(camTrack);
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setMediaNotice('Berbagi layar tidak didukung di browser ini.');
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = displayStream;
      setScreenSharing(true);
      setMediaNotice('Berbagi layar aktif.');
      const [track] = displayStream.getVideoTracks();
      if (track) {
        onReplaceVideoTrack?.(track);
        track.onended = () => {
          screenStreamRef.current = null;
          setScreenSharing(false);
          setMediaNotice(null);
          const camTrack = cameraStreamRef.current?.getVideoTracks()[0] ?? null;
          onReplaceVideoTrack?.(camTrack);
        };
      }
    } catch {
      setMediaNotice('Berbagi layar dibatalkan oleh pengguna.');
    }
  };

  const handleJoinRoomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseHandrawinaJoinInput(joinRoomInput);
    if (parsed.kind === 'call') {
      setJoinRoomError(null);
      setJoinRoomInput('');
      onJoinCallByCode(parsed.code);
      return;
    }
    setJoinRoomError('Masukkan kode ruang Video Call valid (contoh: HND-VID-8F2A10) atau tautan QR.');
  };

  return (
    <div className="flex-1 overflow-y-auto bg-stone-950/42 backdrop-blur-md px-5 sm:px-8 py-8 text-stone-100">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="pb-5 border-b border-amber-200/15 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-amber-50">
              Panggilan Suara &amp; Video Call WebRTC
            </h1>
            <p className="text-sm text-stone-300 mt-1">
              Panggilan audio dan video 1:1 melalui WebRTC peer-to-peer.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenOutgoingCallModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-950 bg-amber-400 hover:bg-amber-300 rounded-md whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <PhoneOutgoing className="w-3.5 h-3.5" aria-hidden="true" />
              Panggilan Keluar
            </button>
            <div className="text-xs font-mono text-stone-300 hidden sm:block">
              Relay: {iceConfig.relayRegion}
            </div>
          </div>
        </header>

        <MeteredGroupCallTestPanel
          contacts={contacts}
          firebaseUser={firebaseUser}
          displayName={displayName}
          oneToOneCallActive={Boolean(activeCall)}
          onActiveChange={onGroupCallActiveChange}
        />

        {/* Active WebRTC Video/Voice Call Stage */}
        {activeCall && (
          <section
            aria-label="Panggung panggilan WebRTC aktif"
            data-testid="active-call-stage"
            className="bg-stone-950/88 backdrop-blur-xl text-stone-100 rounded-lg border border-amber-300/25 overflow-hidden shadow-2xl"
          >
            <div className="px-5 py-3.5 border-b border-amber-200/15 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-sm font-semibold text-amber-50">
                    {activeCall.conversation.name}
                  </span>
                  <span
                    className="text-xs font-mono text-amber-300"
                    data-testid="active-call-room-code"
                  >
                    Ruang {activeCall.roomCode}
                  </span>
                </div>
                <div className="text-xs font-mono text-stone-400 mt-0.5 tabular-nums">
                  {activeCall.direction === 'incoming' ? 'Panggilan Masuk' : 'Panggilan Keluar'} ·{' '}
                  {activeCall.topology} · {formatDuration(elapsedSec)} ·{' '}
                  {activeCall.mode === 'video'
                    ? 'Video'
                    : 'Audio'}
                  {webrtcStatus ? ` · WebRTC: ${webrtcStatus}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-1.5 text-xs text-stone-300">
                  <Lock className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />
                  <span>WebRTC DTLS-SRTP</span>
                </div>
              </div>
            </div>

            {mediaNotice && (
              <div className="px-5 py-2 bg-stone-900/90 border-b border-amber-200/10 text-xs text-stone-300 flex items-center gap-2">
                <Camera className="w-3.5 h-3.5 text-amber-300 shrink-0" aria-hidden="true" />
                <span>{mediaNotice}</span>
              </div>
            )}

            {/* Video / Participant Grid */}
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {activeCall.participants.map((name, idx) => {
                const isLocal = idx === 0;
                const isFirstRemote = idx === 1;
                const showLiveVideoElement =
                  isLocal && ((hasLiveVideoTrack && cameraOn) || screenSharing);
                const showRemoteVideoElement =
                  isFirstRemote && Boolean(remoteStream && remoteStream.getTracks().length > 0);

                return (
                  <div
                    key={`${name}-${idx}`}
                    className="relative aspect-video bg-stone-900/90 border border-amber-200/15 rounded-md overflow-hidden flex flex-col justify-between p-3.5"
                  >
                    {showLiveVideoElement && (
                      <video
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                    {showRemoteVideoElement && (
                      <video
                        ref={remoteVideoRef}
                        autoPlay
                        playsInline
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}

                    <div className="relative z-10 flex items-center justify-between text-[11px] font-mono text-stone-300">
                      <span className="bg-stone-950/75 px-1.5 py-0.5 rounded">
                        {isLocal ? (screenSharing ? 'Layar Anda' : 'Anda (Lokal)') : 'Peserta E2EE'}
                      </span>
                      <span className="bg-stone-950/75 px-1.5 py-0.5 rounded">
                        {isLocal ? (muted ? 'Mute' : 'Mikrofon aktif') : remoteStream ? 'Terhubung' : 'Menunggu media'}
                      </span>
                    </div>

                    {!showLiveVideoElement && !showRemoteVideoElement && (
                      <div className="relative z-10 flex items-center justify-center my-1">
                        <div className="w-12 h-12 rounded-lg bg-amber-400/20 border border-amber-300/35 text-amber-200 font-display font-bold flex items-center justify-center text-sm">
                          {name
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((w) => w[0])
                            .join('')}
                        </div>
                      </div>
                    )}

                    <div className="relative z-10 flex items-center justify-between text-xs">
                      <span className="font-medium truncate bg-stone-950/75 px-1.5 py-0.5 rounded">
                        {name}
                      </span>
                      <span className="text-[11px] font-mono text-amber-300 bg-stone-950/75 px-1.5 py-0.5 rounded">
                        {isLocal && screenSharing
                          ? 'Layar HD'
                          : isLocal && !cameraOn
                          ? 'Kamera Mati'
                          : activeCall.mode === 'video'
                          ? 'Video'
                          : 'Audio'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Call Control Bar */}
            <div className="px-5 py-4 border-t border-amber-200/15 bg-stone-900/75 flex flex-wrap items-center justify-end gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMuted((m) => !m)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                    muted
                      ? 'bg-amber-500 border-amber-400 text-stone-950 font-semibold'
                      : 'bg-stone-800 border-stone-700 text-stone-100 hover:bg-stone-700'
                  }`}
                >
                  {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  {muted ? 'Suara Dibisukan' : 'Bisukan'}
                </button>

                {activeCall.mode === 'video' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setCameraOn((c) => !c)}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                        !cameraOn
                          ? 'bg-stone-700 border-stone-600 text-stone-200'
                          : 'bg-stone-800 border-stone-700 text-stone-100 hover:bg-stone-700'
                      }`}
                    >
                      {cameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                      {cameraOn ? 'Matikan Kamera' : 'Nyalakan Kamera'}
                    </button>

                    <button
                      type="button"
                      onClick={handleToggleScreenShare}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                        screenSharing
                          ? 'bg-amber-400 border-amber-300 text-stone-950 font-semibold'
                          : 'bg-stone-800 border-stone-700 text-stone-100 hover:bg-stone-700'
                      }`}
                    >
                      <MonitorUp className="w-4 h-4" aria-hidden="true" />
                      {screenSharing ? 'Hentikan Layar' : 'Bagikan Layar'}
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => {
                    stopAllMediaStreams();
                    onEndCall(Math.max(1, elapsedSec));
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                >
                  <PhoneOff className="w-4 h-4" aria-hidden="true" />
                  Akhiri Panggilan
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Join Video Call Room by Barcode / Room Code */}
        <section
          aria-label="Gabung ruang video call dengan kode"
          className="bg-stone-950/70 backdrop-blur-xl border border-amber-200/15 rounded-lg p-5"
        >
          <form
            onSubmit={handleJoinRoomSubmit}
            className="flex flex-col sm:flex-row sm:items-end gap-3"
          >
            <div className="flex-1 min-w-0">
              <label
                htmlFor="join-video-room-input"
                className="block text-xs font-semibold text-amber-50 mb-1"
              >
                Gabung Ruang Video Call via Kode Barcode
              </label>
              <input
                id="join-video-room-input"
                type="text"
                value={joinRoomInput}
                onChange={(e) => {
                  setJoinRoomInput(e.target.value);
                  setJoinRoomError(null);
                }}
                placeholder="Masukkan kode HND-VID-... atau tempel tautan undangan Video Call"
                className="w-full px-3 py-2 text-sm font-mono border border-amber-200/20 rounded-md bg-stone-900/80 focus:bg-stone-900 focus:outline-none focus:border-amber-400 text-stone-100 placeholder:text-stone-400"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-stone-950 bg-amber-400 hover:bg-amber-300 rounded-md h-[38px] whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <Video className="w-3.5 h-3.5" aria-hidden="true" />
              Masuk Video Call
            </button>
          </form>
          {joinRoomError && (
            <p className="text-xs text-red-400 font-medium mt-2">{joinRoomError}</p>
          )}
        </section>

        {/* Quick Start Encrypted Calls */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-stone-950/70 backdrop-blur-xl border border-amber-200/15 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-amber-200/12 bg-stone-950/55">
              <h2 className="text-sm font-semibold text-amber-50">
                Mulai Panggilan &amp; Video Call Terenkripsi
              </h2>
            </div>
            <div className="divide-y divide-amber-200/10">
              {conversations.filter((conv) => conv.kind === 'direct').map((conv) => (
                <div
                  key={conv.id}
                  className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-stone-900/45 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-stone-100 truncate">
                      {conv.name}
                    </div>
                    <div className="text-xs text-stone-400 mt-0.5">
                      Panggilan 1:1 WebRTC terenkripsi
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onStartCall(conv, 'audio')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-200 bg-stone-900/80 border border-amber-200/20 hover:bg-stone-800 hover:text-amber-100 rounded-md cursor-pointer transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                      Suara
                    </button>
                    <button
                      type="button"
                      onClick={() => onStartCall(conv, 'video')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-950 bg-amber-400 hover:bg-amber-300 rounded-md cursor-pointer transition-colors"
                    >
                      <Video className="w-3.5 h-3.5" aria-hidden="true" />
                      Video Call
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ICE / STUN / TURN Infrastructure Panel */}
          <div className="bg-stone-950/70 backdrop-blur-xl border border-amber-200/15 rounded-lg p-5 space-y-4">
            <h2 className="text-sm font-semibold text-amber-50">Konfigurasi ICE</h2>
            <dl className="space-y-3 text-xs">
              <div>
                <dt className="text-stone-400">Server STUN Primer</dt>
                <dd className="font-mono text-stone-100 mt-0.5 break-all">
                  {iceConfig.stunUrls[0]}
                </dd>
              </div>
              <div>
                <dt className="text-stone-400">Relay TURN</dt>
                <dd className="font-mono text-stone-100 mt-0.5 break-all">{iceConfig.turnUrl}</dd>
              </div>
              <div>
                <dt className="text-stone-400">Transport Media</dt>
                <dd className="text-stone-300 mt-0.5 leading-relaxed">
                  Media WebRTC memakai DTLS-SRTP.{' '}
                  {iceConfig.relayRegion === 'STUN saja'
                    ? 'Koneksi saat ini memakai STUN saja dan bisa gagal pada jaringan NAT tertentu.'
                    : 'Relay TURN tersedia untuk membantu koneksi pada jaringan NAT tertentu.'}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Call History Table */}
        <div className="bg-stone-950/70 backdrop-blur-xl border border-amber-200/15 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-amber-200/12 bg-stone-950/55">
            <h2 className="text-sm font-semibold text-amber-50">Riwayat Panggilan Terenkripsi</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-amber-200/12 text-stone-400">
                  <th className="py-3 px-4 font-medium">Lawan Bicara / Grup</th>
                  <th className="py-3 px-4 font-medium">Arah</th>
                  <th className="py-3 px-4 font-medium">Mode</th>
                  <th className="py-3 px-4 font-medium">Topologi WebRTC</th>
                  <th className="py-3 px-4 font-medium">Waktu</th>
                  <th className="py-3 px-4 font-medium text-right">Durasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-200/10">
                {callRecords.map((rec) => (
                  <tr key={rec.id} className="hover:bg-stone-900/45 transition-colors">
                    <td className="py-3 px-4 font-medium text-stone-100 flex items-center gap-2">
                      {rec.participants.length > 2 ? (
                        <Users className="w-3.5 h-3.5 text-stone-400" aria-hidden="true" />
                      ) : (
                        <Phone className="w-3.5 h-3.5 text-stone-400" aria-hidden="true" />
                      )}
                      <span>{rec.peerName}</span>
                    </td>
                    <td className="py-3 px-4 text-stone-300">
                      <span className="inline-flex items-center gap-1">
                        {rec.direction === 'outgoing' ? (
                          <PhoneOutgoing
                            className="w-3.5 h-3.5 text-amber-300"
                            aria-hidden="true"
                          />
                        ) : (
                          <PhoneIncoming
                            className="w-3.5 h-3.5 text-stone-400"
                            aria-hidden="true"
                          />
                        )}
                        {rec.direction === 'outgoing' ? 'Keluar' : 'Masuk'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-stone-300">
                      {rec.mode === 'video' ? 'Video HD' : 'Suara Opus'}
                    </td>
                    <td className="py-3 px-4 font-mono text-amber-200">{rec.topology}</td>
                    <td className="py-3 px-4 text-stone-400">{rec.startedAt}</td>
                    <td className="py-3 px-4 font-mono tabular-nums text-right text-stone-200">
                      {formatDuration(rec.durationSec)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
