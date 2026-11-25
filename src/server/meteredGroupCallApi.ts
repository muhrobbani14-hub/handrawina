import { createHmac } from 'node:crypto';
import express from 'express';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

const GROUP_CALL_MAX_PARTICIPANTS = 8;
const GROUP_CALL_DURATION_SECONDS = 60 * 60;
const INVALID_TOKEN_CODES = new Set([
  'auth/argument-error',
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/invalid-id-token',
  'auth/tenant-id-mismatch',
]);

interface VerifiedUser {
  uid: string;
  name?: string;
}

interface MeteredGroupCallApiDependencies {
  verifyIdToken?: (idToken: string) => Promise<VerifiedUser>;
  fetch?: typeof fetch;
}

interface FirestoreValue {
  stringValue?: string;
  arrayValue?: { values?: FirestoreValue[] };
}

interface FirestoreGroupCallDocument {
  fields?: Record<string, FirestoreValue>;
}

interface MeteredApiResult {
  response: Response;
  data: Record<string, unknown> | null;
}

class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

function getFirebaseAuth() {
  const appName = 'metered-group-calls';
  const existingApp = getApps().find((app) => app.name === appName);
  if (existingApp) return getAuth(existingApp);

  const app = initializeApp({ projectId: firebaseConfig.projectId }, appName);
  return getAuth(app);
}

export function createMeteredRoomName(
  callId: string,
  hostUid: string,
  secretKey: string
): string {
  const signature = createHmac('sha256', secretKey)
    .update(`${callId}:${hostUid}`)
    .digest('hex')
    .slice(0, 24);
  return `hnd-${callId.toLowerCase()}-${signature}`;
}

function readConfig(): { domain: string; secretKey: string } {
  const domain = process.env.METERED_DOMAIN?.trim().toLowerCase() ?? '';
  const secretKey = process.env.METERED_SECRET_KEY?.trim() ?? '';
  if (!domain || !secretKey) {
    throw new ApiError(503, 'Konfigurasi Metered Video belum tersedia di server.');
  }
  if (!/^[a-z0-9][a-z0-9-]*\.metered\.live$/.test(domain)) {
    throw new ApiError(503, 'METERED_DOMAIN harus berupa domain aplikasi Metered.');
  }
  return { domain, secretKey };
}

function readStringField(
  document: FirestoreGroupCallDocument,
  name: string
): string | undefined {
  const value = document.fields?.[name]?.stringValue;
  return typeof value === 'string' ? value : undefined;
}

function readStringArrayField(
  document: FirestoreGroupCallDocument,
  name: string
): string[] | undefined {
  const arrayValue = document.fields?.[name]?.arrayValue;
  if (!arrayValue) return undefined;
  const values = arrayValue.values ?? [];
  if (!Array.isArray(values)) return undefined;
  const result: string[] = [];
  for (const value of values) {
    if (typeof value.stringValue !== 'string') return undefined;
    result.push(value.stringValue);
  }
  return result;
}

async function readJsonObject(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const data: unknown = await response.json();
    return data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function fetchFirestoreCall(
  fetchImpl: typeof fetch,
  callId: string,
  idToken: string
): Promise<FirestoreGroupCallDocument> {
  const projectId = encodeURIComponent(firebaseConfig.projectId);
  const databaseId = encodeURIComponent(firebaseConfig.firestoreDatabaseId);
  const safeCallId = encodeURIComponent(callId);
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/groupCallRooms/${safeCallId}`;
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (response.status === 404) {
    throw new ApiError(404, 'Panggilan grup tidak ditemukan.');
  }
  if (response.status === 401 || response.status === 403) {
    throw new ApiError(403, 'Akun ini tidak memiliki akses ke panggilan grup tersebut.');
  }
  if (!response.ok) {
    throw new ApiError(503, 'Tidak dapat memeriksa izin panggilan grup.');
  }

  const document = await readJsonObject(response);
  if (!document) throw new ApiError(503, 'Data panggilan grup tidak dapat dibaca.');
  return document as FirestoreGroupCallDocument;
}

async function requestMetered(
  fetchImpl: typeof fetch,
  config: { domain: string; secretKey: string },
  path: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>
): Promise<MeteredApiResult> {
  const url = new URL(path, `https://${config.domain}`);
  url.searchParams.set('secretKey', config.secretKey);
  const response = await fetchImpl(url, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { response, data: await readJsonObject(response) };
}

async function ensurePrivateRoom(
  fetchImpl: typeof fetch,
  config: { domain: string; secretKey: string },
  roomName: string,
  mode: string
): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + GROUP_CALL_DURATION_SECONDS;
  const createResult = await requestMetered(fetchImpl, config, '/api/v1/room', 'POST', {
    roomName,
    privacy: 'private',
    expireUnixSec: expiresAt,
    ejectAtRoomExp: true,
    maxParticipants: GROUP_CALL_MAX_PARTICIPANTS,
    autoJoin: false,
    enableRequestToJoin: false,
    enableRecording: false,
    recordRoom: false,
    recordComposition: false,
    enableComposition: false,
    enableLiveStreaming: false,
    enableRTMPOut: false,
    audioOnlyRoom: mode === 'audio',
    deleteOnExp: true,
  });

  if (createResult.response.ok) {
    if (createResult.data?.roomName !== roomName || createResult.data?.privacy !== 'private') {
      throw new ApiError(502, 'Metered tidak mengonfirmasi ruang privat yang diminta.');
    }
    return;
  }

  const existingRoom = await requestMetered(
    fetchImpl,
    config,
    `/api/v1/room/${encodeURIComponent(roomName)}`,
    'GET'
  );
  if (
    existingRoom.response.ok &&
    existingRoom.data?.roomName === roomName &&
    existingRoom.data?.privacy === 'private'
  ) {
    return;
  }
  console.error('Metered room creation failed:', {
    createStatus: createResult.response.status,
    lookupStatus: existingRoom.response.status,
  });
  throw new ApiError(502, 'Metered gagal membuat ruang panggilan privat.');
}

function validateCallDocument(
  document: FirestoreGroupCallDocument,
  callId: string
): {
  hostUid: string;
  status: string;
  mode: string;
  invitedUids: string[];
  acceptedUids: string[];
  roomName: string;
} {
  const storedCallId = readStringField(document, 'callId');
  const hostUid = readStringField(document, 'hostUid');
  const status = readStringField(document, 'status');
  const mode = readStringField(document, 'mode');
  const invitedUids = readStringArrayField(document, 'invitedUids');
  const acceptedUids = readStringArrayField(document, 'acceptedUids');
  const declinedUids = readStringArrayField(document, 'declinedUids');
  const roomName = readStringField(document, 'meteredRoomName');

  if (
    storedCallId !== callId ||
    !hostUid ||
    !status ||
    !mode ||
    !invitedUids ||
    !acceptedUids ||
    !declinedUids ||
    roomName === undefined
  ) {
    throw new ApiError(409, 'Data panggilan grup tidak valid.');
  }
  if (
    invitedUids.length < 1 ||
    invitedUids.length > GROUP_CALL_MAX_PARTICIPANTS - 1 ||
    new Set(invitedUids).size !== invitedUids.length ||
    invitedUids.includes(hostUid) ||
    declinedUids.length > GROUP_CALL_MAX_PARTICIPANTS - 1 ||
    new Set(declinedUids).size !== declinedUids.length ||
    acceptedUids.length < 1 ||
    acceptedUids.length > GROUP_CALL_MAX_PARTICIPANTS ||
    new Set(acceptedUids).size !== acceptedUids.length ||
    !acceptedUids.includes(hostUid) ||
    acceptedUids.some((uid) => uid !== hostUid && !invitedUids.includes(uid)) ||
    declinedUids.some(
      (uid) => !invitedUids.includes(uid) || acceptedUids.includes(uid)
    ) ||
    !['audio', 'video'].includes(mode)
  ) {
    throw new ApiError(409, 'Data peserta panggilan grup tidak valid.');
  }
  return { hostUid, status, mode, invitedUids, acceptedUids, roomName };
}

export function createMeteredGroupCallApi(
  dependencies: MeteredGroupCallApiDependencies = {}
): express.Router {
  const router = express.Router();
  const fetchImpl = dependencies.fetch ?? fetch;
  const verifyIdToken =
    dependencies.verifyIdToken ??
    (async (idToken: string) => {
      const decoded = await getFirebaseAuth().verifyIdToken(idToken);
      return { uid: decoded.uid, name: decoded.name };
    });

  router.post('/api/metered-group-call/:action', async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    if (process.env.METERED_GROUP_CALL_TEST_ENABLED !== 'true') {
      res.status(404).json({ error: 'Prototipe panggilan grup sedang dinonaktifkan.' });
      return;
    }

    let config: { domain: string; secretKey: string };
    try {
      config = readConfig();
    } catch (error) {
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      console.error('Metered group-call configuration could not be read.');
      res.status(503).json({ error: 'Konfigurasi Metered Video belum siap.' });
      return;
    }

    const authorization = req.header('authorization') ?? '';
    const tokenMatch = /^Bearer\s+(\S+)$/i.exec(authorization);
    if (!tokenMatch) {
      res.status(401).json({ error: 'Sesi Firebase diperlukan.' });
      return;
    }

    const callId = typeof req.body?.callId === 'string' ? req.body.callId : '';
    if (!['create-room', 'join-token'].includes(req.params.action)) {
      res.status(404).json({ error: 'Aksi panggilan grup tidak tersedia.' });
      return;
    }
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(callId)) {
      res.status(400).json({ error: 'ID panggilan grup tidak valid.' });
      return;
    }

    let user: VerifiedUser;
    try {
      user = await verifyIdToken(tokenMatch[1]);
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String(error.code)
          : '';
      if (INVALID_TOKEN_CODES.has(code)) {
        res.status(401).json({ error: 'Sesi Firebase tidak valid atau sudah kedaluwarsa.' });
        return;
      }
      console.error('Firebase token verification failed for Metered group call.');
      res.status(503).json({ error: 'Layanan autentikasi belum siap.' });
      return;
    }

    try {
      const callDocument = await fetchFirestoreCall(fetchImpl, callId, tokenMatch[1]);
      const call = validateCallDocument(callDocument, callId);

      if (req.params.action === 'create-room') {
        if (
          call.hostUid !== user.uid ||
          call.status !== 'creating' ||
          call.roomName !== ''
        ) {
          throw new ApiError(403, 'Hanya pemanggil yang dapat menyiapkan ruang panggilan.');
        }

        const roomName = createMeteredRoomName(callId, call.hostUid, config.secretKey);
        await ensurePrivateRoom(fetchImpl, config, roomName, call.mode);
        const roomURL = `${config.domain}/${roomName}`;
        res.json({ roomName, roomURL });
        return;
      }

      if (req.params.action !== 'join-token') {
        res.status(404).json({ error: 'Aksi panggilan grup tidak tersedia.' });
        return;
      }

      const expectedRoomName = createMeteredRoomName(callId, call.hostUid, config.secretKey);
      if (
        !['ringing', 'active'].includes(call.status) ||
        call.roomName !== expectedRoomName ||
        (user.uid !== call.hostUid &&
          (!call.invitedUids.includes(user.uid) || !call.acceptedUids.includes(user.uid)))
      ) {
        throw new ApiError(403, 'Akun ini belum diizinkan bergabung ke panggilan tersebut.');
      }

      const providedName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : '';
      const displayName = (providedName || user.name || 'Pengguna').slice(0, 80);
      const expiry = Math.floor(Date.now() / 1000) + GROUP_CALL_DURATION_SECONDS;
      const tokenResult = await requestMetered(fetchImpl, config, '/api/v1/token', 'POST', {
        roomName: expectedRoomName,
        name: displayName,
        externalUserId: user.uid,
        isAdmin: user.uid === call.hostUid,
        expireUnixSec: expiry,
        ejectAfterElapsedTimeInSec: GROUP_CALL_DURATION_SECONDS,
      });

      if (!tokenResult.response.ok || typeof tokenResult.data?.token !== 'string') {
        console.error('Metered access-token request failed:', tokenResult.response.status);
        throw new ApiError(502, 'Metered gagal membuat token panggilan.');
      }

      res.json({
        roomName: expectedRoomName,
        roomURL: `${config.domain}/${expectedRoomName}`,
        accessToken: tokenResult.data.token,
        displayName,
      });
    } catch (error) {
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      console.error('Metered group-call API failed:', error);
      res.status(503).json({ error: 'Layanan panggilan grup belum siap.' });
    }
  });

  return router;
}
