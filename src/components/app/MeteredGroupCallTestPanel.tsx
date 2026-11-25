import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  AlertTriangle,
  Mic,
  MicOff,
  PhoneOff,
  RefreshCw,
  Video,
  VideoOff,
} from 'lucide-react';
import { db } from '../../firebase';
import type { SavedContactRecord } from '../../utils/phoneAuthAndContacts';
import {
  loadMeteredVideoSdk,
  getNextVideoInputDevice,
  type MeteredMeeting,
  type MeteredParticipant,
  type MeteredTrackEvent,
} from '../../services/meteredVideoSdk';
import { formatDuration } from '../../utils/handrawinaState';

const GROUP_CALL_MAX_PARTICIPANTS = 8;
const METERED_TEST_ENABLED =
  import.meta.env.VITE_METERED_GROUP_CALL_TEST_ENABLED === 'true';

type GroupCallMode = 'audio' | 'video';
type GroupCallStatus = 'creating' | 'ringing' | 'active' | 'ended';
interface OneToOneCallContext {
  roomCode: string;
  peerUid: string;
  mode: GroupCallMode;
}

interface GroupCallRecord {
  callId: string;
  hostUid: string;
  hostName: string;
  mode: GroupCallMode;
  status: GroupCallStatus;
  invitedUids: string[];
  acceptedUids: string[];
  declinedUids: string[];
  meteredRoomName: string;
  sourceCallRoomCode: string;
  sourcePeerUid: string;
  joinedUids: string[];
}

interface ActiveGroupCall extends GroupCallRecord {
  roomURL: string;
}

interface ServerCallResponse {
  roomName: string;
  roomURL: string;
  accessToken?: string;
  displayName?: string;
}

interface ParticipantMedia {
  id: string;
  name: string;
  videoStream: MediaStream | null;
  audioStream: MediaStream | null;
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function toGroupCallRecord(callId: string, value: unknown): GroupCallRecord | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (
    data.callId !== callId ||
    typeof data.hostUid !== 'string' ||
    typeof data.hostName !== 'string' ||
    (data.mode !== 'audio' && data.mode !== 'video') ||
    !['creating', 'ringing', 'active', 'ended'].includes(String(data.status)) ||
    !isStringList(data.invitedUids) ||
    !isStringList(data.acceptedUids) ||
    !isStringList(data.declinedUids) ||
    (data.joinedUids !== undefined && !isStringList(data.joinedUids)) ||
    (data.sourceCallRoomCode !== undefined && typeof data.sourceCallRoomCode !== 'string') ||
    (data.sourcePeerUid !== undefined && typeof data.sourcePeerUid !== 'string') ||
    typeof data.meteredRoomName !== 'string'
  ) {
    return null;
  }
  return {
    callId,
    hostUid: data.hostUid,
    hostName: data.hostName,
    mode: data.mode,
    status: data.status as GroupCallStatus,
    invitedUids: data.invitedUids,
    acceptedUids: data.acceptedUids,
    declinedUids: data.declinedUids,
    meteredRoomName: data.meteredRoomName,
    sourceCallRoomCode: typeof data.sourceCallRoomCode === 'string' ? data.sourceCallRoomCode : '',
    sourcePeerUid: typeof data.sourcePeerUid === 'string' ? data.sourcePeerUid : '',
    joinedUids: isStringList(data.joinedUids) ? data.joinedUids : [],
  };
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function markGroupCallParticipantJoined(callId: string, uid: string): Promise<void> {
  const callRef = doc(db, 'groupCallRooms', callId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(callRef);
    const call = snapshot.exists()
      ? toGroupCallRecord(snapshot.id, snapshot.data())
      : null;
    if (!call || call.status === 'ended' || !call.acceptedUids.includes(uid)) {
      throw new Error('Panggilan grup tidak lagi mengizinkan Anda bergabung.');
    }
    if (call.joinedUids.includes(uid)) return;
    if (call.joinedUids.length >= GROUP_CALL_MAX_PARTICIPANTS) {
      throw new Error('Panggilan grup sudah mencapai batas delapan peserta.');
    }
    transaction.update(callRef, {
      joinedUids: [...call.joinedUids, uid],
      updatedAt: serverTimestamp(),
    });
  });
}

async function requestGroupCallApi(
  user: User,
  action: 'create-room' | 'join-token',
  callId: string,
  displayName?: string
): Promise<ServerCallResponse> {
  const response = await fetch(`/api/metered-group-call/${action}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ callId, displayName }),
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Server panggilan grup mengirim respons yang tidak dapat dibaca.');
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('Server panggilan grup mengirim respons yang tidak valid.');
  }
  const data = payload as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      typeof data.error === 'string' ? data.error : 'Permintaan panggilan grup gagal.'
    );
  }
  if (
    typeof data.roomName !== 'string' ||
    typeof data.roomURL !== 'string' ||
    (action === 'join-token' && typeof data.accessToken !== 'string')
  ) {
    throw new Error('Server tidak mengembalikan informasi ruang panggilan yang diperlukan.');
  }
  return {
    roomName: data.roomName,
    roomURL: data.roomURL,
    ...(typeof data.accessToken === 'string' ? { accessToken: data.accessToken } : {}),
    ...(typeof data.displayName === 'string' ? { displayName: data.displayName } : {}),
  };
}

function getParticipantStreams(
  participants: Record<string, ParticipantMedia>,
  event: MeteredTrackEvent,
  stopped = false
): Record<string, ParticipantMedia> {
  const id = event.participantSessionId;
  if (!id) return participants;
  const existing = participants[id] ?? {
    id,
    name: event.name || 'Peserta',
    videoStream: null,
    audioStream: null,
  };
  const updated: ParticipantMedia = {
    ...existing,
    name: event.name || existing.name,
    ...(event.type === 'video'
      ? { videoStream: stopped ? null : new MediaStream([event.track]) }
      : { audioStream: stopped ? null : new MediaStream([event.track]) }),
  };
  if (stopped && !updated.videoStream && !updated.audioStream) {
    const { [id]: _removed, ...remaining } = participants;
    return remaining;
  }
  return { ...participants, [id]: updated };
}

function ParticipantTile({
  name,
  videoStream,
  audioStream,
  local = false,
}: {
  name: string;
  videoStream: MediaStream | null;
  audioStream: MediaStream | null;
  local?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = videoStream;
  }, [videoStream]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.srcObject = audioStream;
  }, [audioStream]);

  return (
    <div className="relative aspect-video min-h-32 overflow-hidden rounded-md border border-amber-200/20 bg-stone-900">
      {videoStream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={local}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {!local && audioStream && <audio ref={audioRef} autoPlay />}
      {!videoStream && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-400/20 font-semibold text-amber-100">
            {name
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0])
              .join('')
              .toUpperCase()}
          </div>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-stone-950/75 px-2.5 py-1.5 text-xs text-stone-100">
        {name}{local ? ' (Anda)' : ''}
      </div>
    </div>
  );
}

export function MeteredGroupCallTestPanel({
  contacts,
  firebaseUser,
  displayName,
  oneToOneCallActive,
  oneToOneCall,
  onActiveChange,
  onOneToOneCallUpgradeComplete,
}: {
  contacts: SavedContactRecord[];
  firebaseUser: User | null;
  displayName: string;
  oneToOneCallActive: boolean;
  oneToOneCall: OneToOneCallContext | null;
  onActiveChange: (active: boolean) => void;
  onOneToOneCallUpgradeComplete: () => Promise<void>;
}) {
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [mode, setMode] = useState<GroupCallMode>('video');
  const [incomingCalls, setIncomingCalls] = useState<GroupCallRecord[]>([]);
  const [activeGroupCall, setActiveGroupCall] = useState<ActiveGroupCall | null>(null);
  const activeGroupCallRef = useRef<ActiveGroupCall | null>(null);
  activeGroupCallRef.current = activeGroupCall;
  const meetingRef = useRef<MeteredMeeting | null>(null);
  const localParticipantIdRef = useRef<string | null>(null);
  const selectedVideoDeviceIdRef = useRef<string | null>(null);
  const upgradeCompletionRoomRef = useRef<string | null>(null);
  const leavingRef = useRef(false);
  const [localParticipantId, setLocalParticipantId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Record<string, ParticipantMedia>>({});
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
  const [microphoneOn, setMicrophoneOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [cameraSwitching, setCameraSwitching] = useState(false);
  const [connected, setConnected] = useState(false);
  const [meetingState, setMeetingState] = useState('Menyiapkan panggilan');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectableContacts = contacts.filter(
    (contact, index) =>
      contact.contactUid !== firebaseUser?.uid &&
      contact.contactUid !== oneToOneCall?.peerUid &&
      contacts.findIndex((entry) => entry.contactUid === contact.contactUid) === index
  );
  const maximumSelectedContacts = oneToOneCall
    ? GROUP_CALL_MAX_PARTICIPANTS - 2
    : GROUP_CALL_MAX_PARTICIPANTS - 1;

  const isMatchingUpgradeInvitation = (call: GroupCallRecord) =>
    Boolean(
      oneToOneCall &&
        firebaseUser &&
        call.sourceCallRoomCode === oneToOneCall.roomCode &&
        call.sourcePeerUid === firebaseUser.uid &&
        call.hostUid === oneToOneCall.peerUid
    );

  const hasUpgradePeerJoined = (call: GroupCallRecord) => {
    if (!oneToOneCall || !firebaseUser || call.sourceCallRoomCode !== oneToOneCall.roomCode) {
      return false;
    }
    if (call.hostUid === firebaseUser.uid) {
      return (
        call.sourcePeerUid === oneToOneCall.peerUid &&
        call.joinedUids.includes(oneToOneCall.peerUid)
      );
    }
    return (
      call.hostUid === oneToOneCall.peerUid &&
      call.sourcePeerUid === firebaseUser.uid &&
      call.joinedUids.includes(firebaseUser.uid)
    );
  };

  useEffect(() => {
    if (!firebaseUser) {
      setIncomingCalls([]);
      return;
    }
    const callsQuery = query(
      collection(db, 'groupCallRooms'),
      where('invitedUids', 'array-contains', firebaseUser.uid)
    );
    return onSnapshot(
      callsQuery,
      (snapshot) => {
        const activeCalls = snapshot.docs
          .map((callDoc) => toGroupCallRecord(callDoc.id, callDoc.data()))
          .filter((call): call is GroupCallRecord => {
            return (
              call !== null &&
              call.hostUid !== firebaseUser.uid &&
              (call.status === 'ringing' || call.status === 'active') &&
              !call.declinedUids.includes(firebaseUser.uid)
            );
          });
        setIncomingCalls(activeCalls);
      },
      (snapshotError) => {
        setError(`Gagal memuat undangan panggilan grup: ${snapshotError.message}`);
      }
    );
  }, [firebaseUser]);

  const finishCurrentCall = useCallback(
    async (endRoom: boolean) => {
      if (leavingRef.current) return;
      leavingRef.current = true;
      const currentCall = activeGroupCallRef.current;
      const meeting = meetingRef.current;
      meetingRef.current = null;
      let cleanupError: string | null = null;

      try {
        if (endRoom && currentCall && firebaseUser?.uid === currentCall.hostUid) {
          await updateDoc(doc(db, 'groupCallRooms', currentCall.callId), {
            status: 'ended',
            updatedAt: serverTimestamp(),
          });
        }
      } catch (error) {
        cleanupError = getErrorMessage(error, 'Gagal mengakhiri ruang panggilan grup.');
      }

      try {
        if (meeting) await meeting.leaveMeeting();
      } catch (error) {
        cleanupError = cleanupError
          ? `${cleanupError} ${getErrorMessage(error, 'Gagal menutup koneksi Metered.')}`
          : getErrorMessage(error, 'Gagal menutup koneksi Metered.');
      } finally {
        activeGroupCallRef.current = null;
        setActiveGroupCall(null);
        localParticipantIdRef.current = null;
        setLocalParticipantId(null);
        selectedVideoDeviceIdRef.current = null;
        upgradeCompletionRoomRef.current = null;
        setParticipants({});
        setLocalVideoStream(null);
        setConnected(false);
        setElapsedSeconds(0);
        setMeetingState('Panggilan selesai');
        onActiveChange(false);
        leavingRef.current = false;
      }

      if (cleanupError) {
        setError(cleanupError);
        throw new Error(cleanupError);
      }
    },
    [firebaseUser, onActiveChange]
  );

  useEffect(() => {
    if (!activeGroupCall) return;
    const callRef = doc(db, 'groupCallRooms', activeGroupCall.callId);
    return onSnapshot(
      callRef,
      (snapshot) => {
        const call = snapshot.exists()
          ? toGroupCallRecord(snapshot.id, snapshot.data())
          : null;
        if (!call || call.status === 'ended') {
          void finishCurrentCall(false).catch((error) => {
            console.error('Failed to clean up ended Metered group call:', error);
          });
        } else if (
          hasUpgradePeerJoined(call) &&
          upgradeCompletionRoomRef.current !== call.callId
        ) {
          upgradeCompletionRoomRef.current = call.callId;
          void onOneToOneCallUpgradeComplete().catch((error) => {
            upgradeCompletionRoomRef.current = null;
            setError(getErrorMessage(error, 'Gagal menyelesaikan perpindahan panggilan.'));
          });
        }
      },
      (snapshotError) => {
        setError(`Gagal memantau panggilan grup: ${snapshotError.message}`);
      }
    );
  }, [
    activeGroupCall?.callId,
    finishCurrentCall,
    firebaseUser,
    oneToOneCall,
    onOneToOneCallUpgradeComplete,
  ]);

  useEffect(() => {
    if (!connected) {
      setElapsedSeconds(0);
      return;
    }
    const timer = window.setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [connected, activeGroupCall?.callId]);

  useEffect(
    () => () => {
      const meeting = meetingRef.current;
      meetingRef.current = null;
      if (meeting) {
        void meeting.leaveMeeting().catch((error) => {
          console.error('Failed to close Metered group call on unmount:', error);
        });
      }
    },
    []
  );

  const joinMeeting = useCallback(
    async (call: GroupCallRecord, tokenResponse: ServerCallResponse) => {
      if (!tokenResponse.accessToken || !firebaseUser) {
        throw new Error('Token Metered atau sesi Firebase tidak tersedia.');
      }
      await loadMeteredVideoSdk();
      if (!window.Metered) throw new Error('Metered Video SDK belum siap.');

      const meeting = new window.Metered.Meeting();
      meetingRef.current = meeting;
      const updateLocalVideo = (track: MediaStreamTrack) => {
        setLocalVideoStream(new MediaStream([track]));
        selectedVideoDeviceIdRef.current = track.getSettings().deviceId || null;
      };
      const addParticipant = (participant: MeteredParticipant) => {
        if (!participant._id || participant._id === localParticipantIdRef.current) return;
        setParticipants((current) => ({
          ...current,
          [participant._id]: current[participant._id] ?? {
            id: participant._id,
            name: participant.name || 'Peserta',
            videoStream: null,
            audioStream: null,
          },
        }));
      };

      meeting.on('localTrackStarted', (item) => {
        if (item.type === 'video') updateLocalVideo(item.track);
      });
      meeting.on('localTrackUpdated', (item) => {
        if (item.type === 'video') updateLocalVideo(item.track);
      });
      meeting.on('localTrackStopped', (item) => {
        if (item.type === 'video') setLocalVideoStream(null);
      });
      meeting.on('remoteTrackStarted', (item) => {
        setParticipants((current) => getParticipantStreams(current, item));
      });
      meeting.on('remoteTrackStopped', (item) => {
        setParticipants((current) => getParticipantStreams(current, item, true));
      });
      meeting.on('participantJoined', addParticipant);
      meeting.on('participantLeft', (participant) => {
        setParticipants((current) => {
          const { [participant._id]: _removed, ...remaining } = current;
          return remaining;
        });
      });
      meeting.on('onlineParticipants', (onlineParticipants) => {
        onlineParticipants.forEach(addParticipant);
      });
      meeting.on('stateChanged', (state) => {
        setMeetingState(state);
        if (state === 'joined' || state === 'reconnect_success') {
          setConnected(true);
          onActiveChange(true);
        }
        if (state === 'network_connection_lost') setConnected(false);
        if (state === 'network_connection_restored') setConnected(false);
      });
      meeting.on('meetingEnded', () => {
        void finishCurrentCall(false).catch((error) => {
          console.error('Failed to leave an ended Metered meeting:', error);
        });
      });
      meeting.on('meetingLeft', () => {
        if (!leavingRef.current) {
          void finishCurrentCall(false).catch((error) => {
            console.error('Failed to clean up a left Metered meeting:', error);
          });
        }
      });

      const nextCall: ActiveGroupCall = {
        ...call,
        roomURL: tokenResponse.roomURL,
      };
      activeGroupCallRef.current = nextCall;
      setActiveGroupCall(nextCall);
      setParticipants({});
      localParticipantIdRef.current = null;
      setLocalParticipantId(null);
      setMeetingState('Menghubungkan ke Metered SFU...');

      try {
        const meetingInfo = await meeting.join({
          roomURL: tokenResponse.roomURL,
          name: tokenResponse.displayName || displayName || firebaseUser.displayName || 'Pengguna',
          accessToken: tokenResponse.accessToken,
        });
        localParticipantIdRef.current = meetingInfo.participantSessionId;
        setLocalParticipantId(meetingInfo.participantSessionId);
        meetingInfo.onlineParticipants.forEach(addParticipant);
        await meeting.startAudio();
        if (call.mode === 'video') await meeting.startVideo();
        await markGroupCallParticipantJoined(call.callId, firebaseUser.uid);
      } catch (error) {
        try {
          await finishCurrentCall(false);
        } catch (cleanupError) {
          throw new Error(
            `${getErrorMessage(error, 'Gagal bergabung ke panggilan grup.')} ${getErrorMessage(cleanupError, 'Gagal membersihkan koneksi.')}`
          );
        }
        throw error;
      }
    },
    [displayName, firebaseUser, finishCurrentCall, onActiveChange]
  );

  const startGroupCall = async (callMode: GroupCallMode) => {
    if (
      !firebaseUser ||
      (oneToOneCallActive && !oneToOneCall) ||
      activeGroupCall ||
      busy
    ) {
      return;
    }
    if (selectedUids.length < 1 || selectedUids.length > maximumSelectedContacts) {
      setError(
        oneToOneCall
          ? 'Pilih minimal satu dan maksimal enam kontak tambahan.'
          : 'Pilih minimal satu dan maksimal tujuh kontak untuk panggilan grup.'
      );
      return;
    }
    const invitedUids = oneToOneCall
      ? [oneToOneCall.peerUid, ...selectedUids]
      : selectedUids;
    setBusy(true);
    onActiveChange(true);
    setError(null);
    let createdCallRef: ReturnType<typeof doc> | null = null;
    try {
      const callRef = doc(collection(db, 'groupCallRooms'));
      const cleanName = (displayName || firebaseUser.displayName || 'Pengguna').slice(0, 80);
      const call: GroupCallRecord = {
        callId: callRef.id,
        hostUid: firebaseUser.uid,
        hostName: cleanName,
        mode: oneToOneCall?.mode ?? callMode,
        status: 'creating',
        invitedUids,
        acceptedUids: [firebaseUser.uid],
        declinedUids: [],
        meteredRoomName: '',
        sourceCallRoomCode: oneToOneCall?.roomCode ?? '',
        sourcePeerUid: oneToOneCall?.peerUid ?? '',
        joinedUids: [],
      };
      await setDoc(callRef, {
        ...call,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      createdCallRef = callRef;

      const room = await requestGroupCallApi(firebaseUser, 'create-room', call.callId);
      await updateDoc(callRef, {
        meteredRoomName: room.roomName,
        status: 'ringing',
        updatedAt: serverTimestamp(),
      });
      const access = await requestGroupCallApi(
        firebaseUser,
        'join-token',
        call.callId,
        cleanName
      );
      await joinMeeting({ ...call, status: 'ringing', meteredRoomName: room.roomName }, access);
      setSelectedUids([]);
    } catch (error) {
      const message = getErrorMessage(error, 'Gagal memulai panggilan grup.');
      if (createdCallRef) {
        try {
          await updateDoc(createdCallRef, {
            status: 'ended',
            updatedAt: serverTimestamp(),
          });
        } catch (cleanupError) {
          setError(`${message} Gagal membersihkan undangan: ${getErrorMessage(cleanupError, 'coba lagi.')}`);
          onActiveChange(false);
          setBusy(false);
          return;
        }
      }
      setError(message);
      if (!activeGroupCallRef.current) onActiveChange(false);
    } finally {
      setBusy(false);
    }
  };

  const acceptGroupCall = async (call: GroupCallRecord) => {
    if (
      !firebaseUser ||
      (oneToOneCallActive && !isMatchingUpgradeInvitation(call)) ||
      activeGroupCall ||
      busy
    ) {
      return;
    }
    setBusy(true);
    onActiveChange(true);
    setError(null);
    try {
      const callRef = doc(db, 'groupCallRooms', call.callId);
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(callRef);
        const latest = snapshot.exists()
          ? toGroupCallRecord(snapshot.id, snapshot.data())
          : null;
        if (
          !latest ||
          !['ringing', 'active'].includes(latest.status) ||
          !latest.invitedUids.includes(firebaseUser.uid) ||
          latest.declinedUids.includes(firebaseUser.uid)
        ) {
          throw new Error('Undangan ini sudah tidak tersedia.');
        }
        if (!latest.acceptedUids.includes(firebaseUser.uid)) {
          if (latest.acceptedUids.length >= GROUP_CALL_MAX_PARTICIPANTS) {
            throw new Error('Panggilan grup sudah mencapai batas delapan peserta.');
          }
          transaction.update(callRef, {
            acceptedUids: [...latest.acceptedUids, firebaseUser.uid],
            status: 'active',
            updatedAt: serverTimestamp(),
          });
        }
      });
      const access = await requestGroupCallApi(
        firebaseUser,
        'join-token',
        call.callId,
        displayName || firebaseUser.displayName || 'Pengguna'
      );
      await joinMeeting({ ...call, status: 'active' }, access);
    } catch (error) {
      setError(getErrorMessage(error, 'Gagal bergabung ke panggilan grup.'));
      if (!activeGroupCallRef.current) onActiveChange(false);
    } finally {
      setBusy(false);
    }
  };

  const declineGroupCall = async (call: GroupCallRecord) => {
    if (!firebaseUser || busy) return;
    setBusy(true);
    setError(null);
    try {
      const callRef = doc(db, 'groupCallRooms', call.callId);
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(callRef);
        const latest = snapshot.exists()
          ? toGroupCallRecord(snapshot.id, snapshot.data())
          : null;
        if (!latest || !latest.invitedUids.includes(firebaseUser.uid)) {
          throw new Error('Undangan ini sudah tidak tersedia.');
        }
        if (
          latest.status === 'ended' ||
          latest.acceptedUids.includes(firebaseUser.uid) ||
          latest.declinedUids.includes(firebaseUser.uid)
        ) {
          return;
        }
        transaction.update(callRef, {
          declinedUids: [...latest.declinedUids, firebaseUser.uid],
          updatedAt: serverTimestamp(),
        });
      });
    } catch (error) {
      setError(getErrorMessage(error, 'Gagal menolak undangan panggilan.'));
    } finally {
      setBusy(false);
    }
  };

  const toggleMicrophone = async () => {
    const meeting = meetingRef.current;
    if (!meeting) return;
    try {
      if (microphoneOn) await meeting.muteLocalAudio();
      else await meeting.unmuteLocalAudio();
      setMicrophoneOn((enabled) => !enabled);
    } catch (error) {
      setError(getErrorMessage(error, 'Gagal mengubah mikrofon.'));
    }
  };

  const toggleCamera = async () => {
    const meeting = meetingRef.current;
    if (!meeting) return;
    try {
      if (cameraOn) await meeting.stopVideo();
      else await meeting.startVideo();
      setCameraOn((enabled) => !enabled);
    } catch (error) {
      setError(getErrorMessage(error, 'Gagal mengubah kamera.'));
    }
  };

  const rotateCamera = async () => {
    const meeting = meetingRef.current;
    if (!meeting || !cameraOn || cameraSwitching) return;
    setCameraSwitching(true);
    setError(null);
    try {
      const devices = await meeting.listVideoInputDevices();
      const currentDeviceId =
        selectedVideoDeviceIdRef.current ||
        localVideoStream?.getVideoTracks()[0]?.getSettings().deviceId ||
        null;
      const nextDevice = getNextVideoInputDevice(devices, currentDeviceId);
      if (!nextDevice) {
        setError(
          devices.length === 0
            ? 'Tidak ada kamera yang tersedia.'
            : 'Perangkat ini hanya memiliki satu kamera.'
        );
        return;
      }

      await meeting.chooseVideoInputDevice(nextDevice.deviceId);
      const stream = await meeting.getLocalVideoStream();
      const [track] = stream.getVideoTracks();
      if (!track) throw new Error('SDK tidak mengembalikan video dari kamera yang dipilih.');
      selectedVideoDeviceIdRef.current = nextDevice.deviceId;
      setLocalVideoStream(new MediaStream([track]));
    } catch (error) {
      setError(getErrorMessage(error, 'Gagal mengganti kamera.'));
    } finally {
      setCameraSwitching(false);
    }
  };

  const displayedParticipants = Object.values(participants).filter(
    (participant) => participant.id !== localParticipantId
  );

  return (
    <section
      aria-label="Prototipe panggilan grup Metered"
      className="bg-stone-950/75 backdrop-blur-xl border border-amber-200/20 rounded-lg overflow-hidden"
      data-testid="metered-group-call-test-panel"
    >
      <div className="px-5 py-4 border-b border-amber-200/15">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 text-amber-300 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-amber-50">
              Panggilan Grup · Prototipe Uji
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-amber-100/85">
              Tidak menggunakan E2EE. Media dirutekan melalui Metered SFU; gunakan hanya akun
              pengujian dan jangan membahas hal sensitif. Batas maksimum 8 peserta termasuk Anda.
            </p>
          </div>
        </div>
      </div>

      {!METERED_TEST_ENABLED ? (
        <p className="px-5 py-4 text-xs text-stone-300">
          Antarmuka uji dinonaktifkan. Aktifkan{' '}
          <code className="font-mono text-amber-200">VITE_METERED_GROUP_CALL_TEST_ENABLED=true</code>{' '}
          pada build uji dan <code className="font-mono text-amber-200">METERED_GROUP_CALL_TEST_ENABLED=true</code>{' '}
          di server setelah menyiapkan kredensial Metered.
        </p>
      ) : (
        <div className="p-5 space-y-4">
          {error && (
            <p role="alert" className="rounded-md border border-red-400/30 bg-red-950/40 px-3 py-2 text-xs text-red-200">
              {error}
            </p>
          )}

          {incomingCalls.map((call) => (
            <div
              key={call.callId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200/20 bg-amber-950/20 px-3 py-3"
              data-testid="incoming-group-call"
            >
              <div>
                <p className="text-sm font-medium text-stone-100">
                  {call.hostName} mengundang Anda ke panggilan grup
                </p>
                <p className="mt-1 text-xs text-stone-400">
                  {call.mode === 'video' ? 'Video' : 'Suara'} ·{' '}
                  {call.acceptedUids.length}/{GROUP_CALL_MAX_PARTICIPANTS} peserta bergabung
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={
                    busy ||
                    (oneToOneCallActive && !isMatchingUpgradeInvitation(call)) ||
                    Boolean(activeGroupCall)
                  }
                  onClick={() => void acceptGroupCall(call)}
                  className="rounded-md bg-amber-400 px-3 py-2 text-xs font-semibold text-stone-950 hover:bg-amber-300 disabled:opacity-50"
                >
                  {call.acceptedUids.includes(firebaseUser?.uid ?? '')
                    ? 'Gabung kembali'
                    : isMatchingUpgradeInvitation(call)
                      ? 'Pindah ke panggilan grup'
                      : 'Terima'}
                </button>
                <button
                  type="button"
                  disabled={busy || call.acceptedUids.includes(firebaseUser?.uid ?? '')}
                  onClick={() => void declineGroupCall(call)}
                  className="rounded-md border border-stone-600 px-3 py-2 text-xs text-stone-200 hover:bg-stone-800 disabled:opacity-50"
                >
                  Tolak
                </button>
              </div>
            </div>
          ))}

          {activeGroupCall ? (
            <div className="space-y-4" data-testid="metered-group-call-active">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-stone-100">
                    {activeGroupCall.hostName} · {activeGroupCall.mode === 'video' ? 'Video' : 'Suara'}
                  </h3>
                  <p className="mt-1 text-xs text-stone-400">
                    Metered SFU (uji non-E2EE) · {meetingState} · {formatDuration(elapsedSeconds)}
                  </p>
                  {activeGroupCall.sourcePeerUid &&
                    !activeGroupCall.joinedUids.includes(activeGroupCall.sourcePeerUid) && (
                      <p className="mt-1 text-xs text-amber-200">
                        Menunggu lawan bicara 1:1 bergabung sebelum panggilan lama ditutup.
                      </p>
                    )}
                </div>
                <span className="text-xs text-stone-300">
                  {displayedParticipants.length + 1}/{GROUP_CALL_MAX_PARTICIPANTS} peserta
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <ParticipantTile
                  name={displayName || firebaseUser?.displayName || 'Anda'}
                  videoStream={cameraOn ? localVideoStream : null}
                  audioStream={null}
                  local
                />
                {displayedParticipants.map((participant) => (
                  <ParticipantTile
                    key={participant.id}
                    name={participant.name}
                    videoStream={participant.videoStream}
                    audioStream={participant.audioStream}
                  />
                ))}
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-amber-200/10 pt-4">
                <button
                  type="button"
                  onClick={() => void toggleMicrophone()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-stone-700 bg-stone-800 px-3 py-2 text-xs text-stone-100 hover:bg-stone-700"
                >
                  {microphoneOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                  {microphoneOn ? 'Bisukan' : 'Nyalakan mikrofon'}
                </button>
                {activeGroupCall.mode === 'video' && (
                  <>
                    <button
                      type="button"
                      onClick={() => void toggleCamera()}
                      className="inline-flex items-center gap-1.5 rounded-md border border-stone-700 bg-stone-800 px-3 py-2 text-xs text-stone-100 hover:bg-stone-700"
                    >
                      {cameraOn ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
                      {cameraOn ? 'Matikan kamera' : 'Nyalakan kamera'}
                    </button>
                    <button
                      type="button"
                      disabled={!cameraOn || cameraSwitching}
                      onClick={() => void rotateCamera()}
                      className="inline-flex items-center gap-1.5 rounded-md border border-stone-700 bg-stone-800 px-3 py-2 text-xs text-stone-100 hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RefreshCw className={`h-4 w-4 ${cameraSwitching ? 'animate-spin' : ''}`} />
                      {cameraSwitching ? 'Mengganti kamera...' : 'Ganti kamera'}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => void finishCurrentCall(activeGroupCall.hostUid === firebaseUser?.uid).catch(() => undefined)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
                >
                  <PhoneOff className="h-4 w-4" />
                  {activeGroupCall.hostUid === firebaseUser?.uid ? 'Akhiri untuk semua' : 'Keluar'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-stone-100">
                  {oneToOneCall ? 'Tambahkan kontak ke panggilan ini' : 'Buat panggilan grup'}
                </h3>
                <p className="mt-1 text-xs text-stone-400">
                  {oneToOneCall
                    ? 'Panggilan tetap berjalan sambil menunggu lawan bicara pindah ke ruang grup. Pilih hingga enam kontak tambahan.'
                    : 'Pilih kontak tersimpan untuk diundang. Maksimal tujuh undangan selain Anda.'}
                </p>
              </div>

              {oneToOneCall ? (
                <p className="text-xs text-stone-300">
                  Jenis panggilan dipertahankan: {oneToOneCall.mode === 'video' ? 'video' : 'suara'}.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(['video', 'audio'] as const).map((callMode) => (
                    <button
                      key={callMode}
                      type="button"
                      aria-pressed={mode === callMode}
                      onClick={() => setMode(callMode)}
                      className={`rounded-md border px-3 py-2 text-xs ${
                        mode === callMode
                          ? 'border-amber-300 bg-amber-400 text-stone-950'
                          : 'border-stone-700 bg-stone-900 text-stone-200'
                      }`}
                    >
                      {callMode === 'video' ? 'Video Call' : 'Panggilan Suara'}
                    </button>
                  ))}
                </div>
              )}

              <div className="max-h-56 divide-y divide-stone-800 overflow-y-auto rounded-md border border-stone-800">
                {selectableContacts.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-stone-400">Belum ada kontak tersimpan yang dapat diundang.</p>
                ) : (
                  selectableContacts.map((contact) => {
                    const selected = selectedUids.includes(contact.contactUid);
                    return (
                      <label
                        key={contact.contactUid}
                        className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-stone-900"
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={!selected && selectedUids.length >= maximumSelectedContacts}
                          onChange={(event) => {
                            setSelectedUids((current) =>
                              event.target.checked
                                ? [...current, contact.contactUid]
                                : current.filter((uid) => uid !== contact.contactUid)
                            );
                          }}
                          className="accent-amber-400"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium text-stone-100">
                            {contact.contactName || contact.profileName}
                          </span>
                          <span className="block truncate text-[11px] text-stone-400">
                            {contact.phoneNumber}
                          </span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-stone-400">
                  {selectedUids.length + (oneToOneCall ? 2 : 1)}/{GROUP_CALL_MAX_PARTICIPANTS} peserta dipilih
                </span>
                <button
                  type="button"
                  disabled={
                    busy ||
                    !firebaseUser ||
                    (oneToOneCallActive && !oneToOneCall) ||
                    selectedUids.length === 0 ||
                    selectedUids.length > maximumSelectedContacts
                  }
                  onClick={() => void startGroupCall(mode)}
                  className="rounded-md bg-amber-400 px-4 py-2 text-xs font-semibold text-stone-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy
                    ? 'Menyiapkan panggilan...'
                    : oneToOneCall
                      ? 'Tambahkan kontak'
                      : 'Mulai dan undang'}
                </button>
              </div>
              {oneToOneCallActive && !oneToOneCall && (
                <p className="text-xs text-amber-200">
                  Panggilan 1:1 belum tersambung atau identitas lawan bicara belum tersedia.
                  Tunggu sampai tersambung sebelum menambahkan kontak.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
