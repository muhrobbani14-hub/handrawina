import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  appendIceCandidateBounded,
  clampStr,
  deserializeIceCandidates,
  sanitizeFirestoreId,
  type SerializedIceCandidates,
} from '../utils/multiUserChat';
import { requireWebRtcSdp } from '../utils/webrtcSdp';

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];
const CALL_RING_TIMEOUT_MS = 45_000;

export interface IncomingCallNotification {
  roomCode: string;
  mode: 'audio' | 'video';
  hostUid: string;
  hostName: string;
  conversationId: string;
}

export interface WebRtcSignalingCallbacks {
  onRemoteStream: (stream: MediaStream) => void;
  onPeerConnected: (peerName: string) => void;
  onConnectionStateChange: (state: string) => void;
  onTransportTypeChange: (topology: 'P2P-DTLS-SRTP' | 'TURN-Relay-SRTP') => void;
  onCallEndedRemotely: () => void;
  onCallError: (message: string) => void;
}

export class HandrawinaWebRtcSession {
  private pc: RTCPeerConnection | null = null;
  private roomCode: string;
  private role: 'caller' | 'callee';
  private iceServers: RTCIceServer[];
  private unsubscribers: Unsubscribe[] = [];
  private appliedRemoteCandidates = new Set<string>();
  private localBucket: SerializedIceCandidates = {
    candidateStrings: [],
    sdpMids: [],
    sdpMLineIndexes: [],
  };
  private signalDocCreated = false;
  private signalReady = false;
  private signalWriteChain: Promise<void> = Promise.resolve();
  private remoteDescriptionSet = false;
  private pendingRemoteCandidates: RTCIceCandidateInit[] = [];
  private closed = false;
  private roomCreated = false;
  private ringTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    roomCode: string,
    role: 'caller' | 'callee',
    iceServers: RTCIceServer[] = DEFAULT_ICE_SERVERS
  ) {
    this.roomCode = sanitizeFirestoreId(roomCode.toUpperCase(), 'HND-VID-ROOM');
    this.role = role;
    this.iceServers = iceServers;
  }

  private createPeerConnection(
    localStream: MediaStream,
    localUid: string,
    callbacks: WebRtcSignalingCallbacks
  ): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pc = pc;
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    const remoteStream = new MediaStream();
    pc.ontrack = (event) => {
      if (event.streams[0]) {
        event.streams[0].getTracks().forEach((t) => {
          if (!remoteStream.getTracks().some((existing) => existing.id === t.id)) {
            remoteStream.addTrack(t);
          }
        });
      } else {
        remoteStream.addTrack(event.track);
      }
      callbacks.onRemoteStream(remoteStream);
    };

    pc.onconnectionstatechange = () => {
      callbacks.onConnectionStateChange(pc.connectionState);
      if (pc.connectionState === 'connected') {
        void pc
          .getStats()
          .then((report) => {
            type CandidatePairStats = {
              type: 'candidate-pair';
              state?: string;
              nominated?: boolean;
              localCandidateId?: string;
            };
            type LocalCandidateStats = {
              type: 'local-candidate';
              candidateType?: string;
            };
            const selectedPair = Array.from(report.values())
              .filter((stat) => stat.type === 'candidate-pair')
              .map((stat) => stat as CandidatePairStats)
              .find((pair) => pair.state === 'succeeded' && pair.nominated);
            if (!selectedPair) return;
            const localCandidate = selectedPair.localCandidateId
              ? (report.get(selectedPair.localCandidateId) as
                  | LocalCandidateStats
                  | undefined)
              : undefined;
            callbacks.onTransportTypeChange(
              localCandidate?.candidateType === 'relay'
                ? 'TURN-Relay-SRTP'
                : 'P2P-DTLS-SRTP'
            );
          })
          .catch((error) => {
            console.error('Failed to inspect WebRTC candidate route:', error);
          });
      }
      if (pc.connectionState === 'failed') {
        callbacks.onCallError(
          'Koneksi WebRTC gagal. Periksa jaringan dan konfigurasi TURN, lalu coba lagi.'
        );
      }
    };

    pc.onicecandidate = async (event) => {
      if (!event.candidate || this.closed) return;
      const nextBucket = appendIceCandidateBounded(this.localBucket, {
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid,
        sdpMLineIndex: event.candidate.sdpMLineIndex,
      });
      if (nextBucket === this.localBucket) return;
      this.localBucket = nextBucket;
      void this.flushLocalCandidates(localUid).catch((error) => {
        callbacks.onCallError(
          error instanceof Error ? error.message : 'Gagal mengirim kandidat jaringan WebRTC.'
        );
      });
    };

    return pc;
  }

  private async flushLocalCandidates(localUid: string): Promise<void> {
    if (!this.signalReady || this.closed) return;

    const safeUid = sanitizeFirestoreId(localUid, 'user');
    const signalRef = doc(db, 'callRooms', this.roomCode, 'signals', this.role);
    const candidateSnapshot = this.localBucket;
    const write = this.signalWriteChain.catch(() => undefined).then(async () => {
      if (this.closed) return;
      const candidates = {
        candidateStrings: candidateSnapshot.candidateStrings,
        sdpMids: candidateSnapshot.sdpMids,
        sdpMLineIndexes: candidateSnapshot.sdpMLineIndexes,
      };
      if (!this.signalDocCreated) {
        await setDoc(signalRef, {
          role: this.role,
          senderUid: safeUid,
          ...candidates,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        this.signalDocCreated = true;
      } else {
        await updateDoc(signalRef, {
          ...candidates,
          updatedAt: serverTimestamp(),
        });
      }
    });
    this.signalWriteChain = write;
    await write;
  }

  private async addRemoteCandidatesSafe(candidates: RTCIceCandidateInit[]): Promise<void> {
    if (!this.pc || this.closed) return;
    for (const c of candidates) {
      if (!c.candidate || this.appliedRemoteCandidates.has(c.candidate)) continue;
      this.appliedRemoteCandidates.add(c.candidate);
      if (!this.remoteDescriptionSet) {
        this.pendingRemoteCandidates.push(c);
        continue;
      }
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(c));
      } catch {
        // Ignore stale ICE candidates
      }
    }
  }

  private async drainPendingCandidates(): Promise<void> {
    if (!this.pc || this.closed) return;
    const queue = this.pendingRemoteCandidates.splice(0);
    for (const c of queue) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(c));
      } catch {
        // Ignore stale candidates
      }
    }
  }

  private listenRemoteSignals(
    remoteRole: 'caller' | 'callee',
    callbacks: WebRtcSignalingCallbacks
  ): void {
    const signalRef = doc(db, 'callRooms', this.roomCode, 'signals', remoteRole);
    const unsub = onSnapshot(
      signalRef,
      (snap) => {
        if (!snap.exists() || this.closed) return;
        const data = snap.data();
        const decoded = deserializeIceCandidates({
          candidateStrings: Array.isArray(data.candidateStrings) ? data.candidateStrings.map(String) : [],
          sdpMids: Array.isArray(data.sdpMids) ? data.sdpMids.map(String) : [],
          sdpMLineIndexes: Array.isArray(data.sdpMLineIndexes) ? data.sdpMLineIndexes.map(Number) : [],
        });
        void this.addRemoteCandidatesSafe(decoded);
      },
      (error) => {
        callbacks.onCallError(
          error instanceof Error ? error.message : 'Gagal membaca kandidat jaringan rekan.'
        );
      }
    );
    this.unsubscribers.push(unsub);
  }

  async startAsHost(params: {
    hostUid: string;
    hostName: string;
    targetPeerUid: string;
    conversationId?: string;
    mode: 'audio' | 'video';
    protectIpViaTurn: boolean;
    localStream: MediaStream;
    callbacks: WebRtcSignalingCallbacks;
  }): Promise<void> {
    const hostUid = sanitizeFirestoreId(params.hostUid, 'user');
    const targetPeerUid = sanitizeFirestoreId(params.targetPeerUid, '');
    if (!targetPeerUid || targetPeerUid === hostUid) {
      throw new Error('Kontak ini tidak memiliki akun cloud yang dapat dipanggil.');
    }
    const participantIds = [hostUid];
    participantIds.push(targetPeerUid);

    const pc = this.createPeerConnection(params.localStream, hostUid, params.callbacks);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const offerSdp = requireWebRtcSdp(pc.localDescription?.sdp, 'offer');

    const roomRef = doc(db, 'callRooms', this.roomCode);
    try {
      await setDoc(roomRef, {
        roomCode: this.roomCode,
        mode: params.mode,
        status: 'ringing',
        conversationId: clampStr(params.conversationId, 128, ''),
        hostUid,
        hostName: clampStr(params.hostName, 80, 'Host Handrawina'),
        calleeUid: '',
        calleeName: '',
        participantIds,
        offerSdp,
        offerType: clampStr(offer.type, 16, 'offer'),
        answerSdp: '',
        answerType: '',
        protectIpViaTurn: Boolean(params.protectIpViaTurn),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `callRooms/${this.roomCode}`);
    }
    this.roomCreated = true;
    this.signalReady = true;
    await this.flushLocalCandidates(hostUid);
    this.ringTimer = setTimeout(() => {
      void getDoc(roomRef)
        .then((snap) => {
          if (!snap.exists() || this.closed || snap.data().status !== 'ringing') return;
          params.callbacks.onCallError('Panggilan tidak dijawab. Coba hubungi lagi nanti.');
        })
        .catch((error) => {
          params.callbacks.onCallError(
            error instanceof Error ? error.message : 'Gagal memeriksa status panggilan.'
          );
        });
    }, CALL_RING_TIMEOUT_MS);

    // Listen for callee's SDP answer and remote hangup
    const unsubRoom = onSnapshot(
      roomRef,
      async (snap) => {
        if (!snap.exists() || this.closed) return;
        const data = snap.data();
        if (data.status === 'connected' && this.ringTimer) {
          clearTimeout(this.ringTimer);
          this.ringTimer = null;
        }
        if (data.status === 'ended') {
          params.callbacks.onCallEndedRemotely();
          return;
        }
        if (data.answerSdp && !this.remoteDescriptionSet && this.pc) {
          try {
            await this.pc.setRemoteDescription(
              new RTCSessionDescription({
                type: (data.answerType as RTCSdpType) || 'answer',
                sdp: requireWebRtcSdp(data.answerSdp, 'answer'),
              })
            );
            this.remoteDescriptionSet = true;
            await this.drainPendingCandidates();
            params.callbacks.onPeerConnected(String(data.calleeName || 'Rekan Handrawina'));
          } catch (error) {
            params.callbacks.onCallError(
              error instanceof Error ? error.message : 'Jawaban signaling WebRTC tidak valid.'
            );
          }
        }
      },
      (error) => {
        params.callbacks.onCallError(
          error instanceof Error ? error.message : 'Gagal memantau status panggilan.'
        );
      }
    );
    this.unsubscribers.push(unsubRoom);
    this.listenRemoteSignals('callee', params.callbacks);
  }

  async joinAsCallee(params: {
    calleeUid: string;
    calleeName: string;
    localStream: MediaStream;
    callbacks: WebRtcSignalingCallbacks;
  }): Promise<{
    ok: boolean;
    hostName?: string;
    hostUid?: string;
    mode?: 'audio' | 'video';
    error?: string;
  }> {
    const calleeUid = sanitizeFirestoreId(params.calleeUid, 'user');
    const roomRef = doc(db, 'callRooms', this.roomCode);

    let snap;
    try {
      snap = await getDoc(roomRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `callRooms/${this.roomCode}`);
    }

    if (!snap.exists()) {
      return { ok: false, error: `Ruang panggilan ${this.roomCode} tidak ditemukan atau sudah ditutup.` };
    }

    const roomData = snap.data();
    if (roomData.status === 'ended') {
      return { ok: false, error: 'Panggilan ini sudah berakhir.' };
    }
    if (roomData.status !== 'ringing') {
      return { ok: false, error: 'Panggilan ini sudah dijawab di perangkat lain.' };
    }
    if (!roomData.offerSdp) {
      return { ok: false, error: 'Host belum siap mengirim sinyal WebRTC. Coba beberapa detik lagi.' };
    }
    const permittedParticipants = Array.isArray(roomData.participantIds)
      ? roomData.participantIds.map(String)
      : [];
    if (!permittedParticipants.includes(calleeUid)) {
      return { ok: false, error: 'Akun ini tidak dituju dalam panggilan tersebut.' };
    }

    const pc = this.createPeerConnection(params.localStream, calleeUid, params.callbacks);
    this.roomCreated = true;
    const offerSdp = requireWebRtcSdp(roomData.offerSdp, 'offer');
    await pc.setRemoteDescription(
      new RTCSessionDescription({
        type: (roomData.offerType as RTCSdpType) || 'offer',
        sdp: offerSdp,
      })
    );
    this.remoteDescriptionSet = true;

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    const answerSdp = requireWebRtcSdp(pc.localDescription?.sdp, 'answer');

    const existingParticipants = Array.isArray(roomData.participantIds)
      ? roomData.participantIds.map(String)
      : [String(roomData.hostUid)];
    const nextParticipants = existingParticipants.includes(calleeUid)
      ? existingParticipants
      : [...existingParticipants, calleeUid].slice(0, 10);

    try {
      await updateDoc(roomRef, {
        status: 'connected',
        calleeUid,
        calleeName: clampStr(params.calleeName, 80, 'Peserta Handrawina'),
        participantIds: nextParticipants,
        answerSdp,
        answerType: clampStr(answer.type, 16, 'answer'),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `callRooms/${this.roomCode}`);
    }
    this.signalReady = true;
    await this.flushLocalCandidates(calleeUid);

    params.callbacks.onPeerConnected(String(roomData.hostName || 'Host Handrawina'));

    // Now that calleeUid is recorded on the room, we are authorized to read caller's ICE signals!
    this.listenRemoteSignals('caller', params.callbacks);

    const unsubRoom = onSnapshot(
      roomRef,
      (s) => {
        if (!s.exists() || this.closed) return;
        if (s.data().status === 'ended') {
          params.callbacks.onCallEndedRemotely();
        }
      },
      (error) => {
        params.callbacks.onCallError(
          error instanceof Error ? error.message : 'Gagal memantau status panggilan.'
        );
      }
    );
    this.unsubscribers.push(unsubRoom);

    return {
      ok: true,
      hostName: String(roomData.hostName || 'Host Handrawina'),
      hostUid: String(roomData.hostUid || ''),
      mode: (roomData.mode as 'audio' | 'video') || 'video',
    };
  }

  replaceVideoTrack(track: MediaStreamTrack | null): void {
    if (!this.pc || this.closed) return;
    const sender = this.pc.getSenders().find((s) => s.track?.kind === 'video');
    if (sender) {
      void sender.replaceTrack(track);
    }
  }

  async endCall(updateRoomStatus = true): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.ringTimer) {
      clearTimeout(this.ringTimer);
      this.ringTimer = null;
    }
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    if (updateRoomStatus && this.roomCreated) {
      try {
        await updateDoc(doc(db, 'callRooms', this.roomCode), {
          status: 'ended',
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `callRooms/${this.roomCode}`);
      }
    }
  }
}

export async function endCallRoom(roomCode: string): Promise<void> {
  const safeRoomCode = sanitizeFirestoreId(roomCode.toUpperCase(), 'HND-VID-ROOM');
  try {
    await updateDoc(doc(db, 'callRooms', safeRoomCode), {
      status: 'ended',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `callRooms/${safeRoomCode}`);
  }
}

export function subscribeIncomingCalls(
  currentUid: string,
  onIncoming: (incoming: IncomingCallNotification | null) => void
): Unsubscribe {
  const safeUid = sanitizeFirestoreId(currentUid, 'user');
  const q = query(
    collection(db, 'callRooms'),
    where('participantIds', 'array-contains', safeUid)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const ringingDoc = snapshot.docs.find((d) => {
        const data = d.data();
        return data.status === 'ringing' && String(data.hostUid) !== safeUid;
      });
      if (!ringingDoc) {
        onIncoming(null);
        return;
      }
      const data = ringingDoc.data();
      onIncoming({
        roomCode: String(data.roomCode ?? ringingDoc.id),
        mode: (data.mode as 'audio' | 'video') ?? 'video',
        hostUid: String(data.hostUid ?? ''),
        hostName: String(data.hostName ?? 'Rekan Handrawina'),
        conversationId: String(data.conversationId ?? ''),
      });
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'callRooms');
    }
  );
}
