import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { test } from 'node:test';
import express from 'express';
import {
  createMeteredGroupCallApi,
  createMeteredRoomName,
} from './meteredGroupCallApi.ts';

const ENV_KEYS = [
  'METERED_GROUP_CALL_TEST_ENABLED',
  'METERED_DOMAIN',
  'METERED_SECRET_KEY',
] as const;

function saveEnvironment(): Record<(typeof ENV_KEYS)[number], string | undefined> {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]])) as Record<
    (typeof ENV_KEYS)[number],
    string | undefined
  >;
}

function restoreEnvironment(previous: Record<(typeof ENV_KEYS)[number], string | undefined>) {
  for (const key of ENV_KEYS) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
}

function setTestEnvironment() {
  process.env.METERED_GROUP_CALL_TEST_ENABLED = 'true';
  process.env.METERED_DOMAIN = 'example.metered.live';
  process.env.METERED_SECRET_KEY = 'server-only-test-secret';
}

function firestoreCallDocument(params: {
  callId: string;
  hostUid: string;
  invitedUids: string[];
  acceptedUids: string[];
  status: string;
  roomName: string;
}) {
  const stringValue = (value: string) => ({ stringValue: value });
  const stringList = (values: string[]) => ({
    arrayValue: { values: values.map(stringValue) },
  });
  return {
    fields: {
      callId: stringValue(params.callId),
      hostUid: stringValue(params.hostUid),
      hostName: stringValue('Host'),
      mode: stringValue('video'),
      status: stringValue(params.status),
      invitedUids: stringList(params.invitedUids),
      acceptedUids: stringList(params.acceptedUids),
      declinedUids: stringList([]),
      meteredRoomName: stringValue(params.roomName),
    },
  };
}

async function startApiServer(
  fetchImpl: typeof fetch,
  verifyIdToken: (idToken: string) => Promise<{ uid: string; name?: string }>
) {
  const app = express();
  app.use(express.json());
  app.use(createMeteredGroupCallApi({ fetch: fetchImpl, verifyIdToken }));
  const server = app.listen(0);
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function stopApiServer(server: Server) {
  server.close();
  await once(server, 'close');
}

test('Metered group-call routes stay disabled unless test mode is explicitly enabled', async () => {
  const previous = saveEnvironment();
  delete process.env.METERED_GROUP_CALL_TEST_ENABLED;
  let fetchCount = 0;
  const { server, baseUrl } = await startApiServer(
    async () => {
      fetchCount += 1;
      return new Response('{}', { status: 200 });
    },
    async () => ({ uid: 'host-uid' })
  );

  try {
    const response = await fetch(`${baseUrl}/api/metered-group-call/create-room`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId: 'call-test' }),
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: 'Prototipe panggilan grup sedang dinonaktifkan.',
    });
    assert.equal(fetchCount, 0);
  } finally {
    await stopApiServer(server);
    restoreEnvironment(previous);
  }
});

test('Metered room and join tokens are created privately and scoped to accepted users', async () => {
  const previous = saveEnvironment();
  setTestEnvironment();
  const callId = 'call-test-123';
  const hostUid = 'host-uid';
  const invitedUid = 'guest-uid';
  const secretKey = process.env.METERED_SECRET_KEY ?? '';
  let authenticatedUid = hostUid;
  let currentCall = firestoreCallDocument({
    callId,
    hostUid,
    invitedUids: [invitedUid],
    acceptedUids: [hostUid],
    status: 'creating',
    roomName: '',
  });
  const meteredRequests: { path: string; body: Record<string, unknown> | null }[] = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === 'firestore.googleapis.com') {
      return new Response(JSON.stringify(currentCall), { status: 200 });
    }

    const body =
      typeof init?.body === 'string'
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : null;
    meteredRequests.push({ path: url.pathname, body });
    if (url.pathname === '/api/v1/room') {
      assert.equal(url.searchParams.get('secretKey'), secretKey);
      return new Response(
        JSON.stringify({ roomName: body?.roomName, privacy: 'private' }),
        { status: 200 }
      );
    }
    if (url.pathname === '/api/v1/token') {
      return new Response(JSON.stringify({ token: 'short-lived-room-token' }), {
        status: 200,
      });
    }
    return new Response('{}', { status: 404 });
  };
  const { server, baseUrl } = await startApiServer(
    fetchImpl,
    async (idToken) => {
      assert.equal(idToken, 'test-token');
      return { uid: authenticatedUid, name: authenticatedUid === hostUid ? 'Host' : 'Guest' };
    }
  );

  try {
    const headers = {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    };
    const createResponse = await fetch(`${baseUrl}/api/metered-group-call/create-room`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ callId }),
    });
    assert.equal(createResponse.status, 200);
    const created = (await createResponse.json()) as {
      roomName: string;
      roomURL: string;
    };
    const expectedRoomName = createMeteredRoomName(callId, hostUid, secretKey);
    assert.equal(created.roomName, expectedRoomName);
    assert.equal(created.roomURL, `example.metered.live/${expectedRoomName}`);

    const createRoomBody = meteredRequests[0]?.body;
    assert.equal(createRoomBody?.privacy, 'private');
    assert.equal(createRoomBody?.maxParticipants, 8);
    assert.equal(createRoomBody?.enableRecording, false);
    assert.equal(createRoomBody?.recordRoom, false);

    currentCall = firestoreCallDocument({
      callId,
      hostUid,
      invitedUids: [invitedUid],
      acceptedUids: [hostUid],
      status: 'ringing',
      roomName: expectedRoomName,
    });
    const tokenResponse = await fetch(`${baseUrl}/api/metered-group-call/join-token`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ callId, displayName: 'Host Test' }),
    });
    assert.equal(tokenResponse.status, 200);
    const tokenPayload = (await tokenResponse.json()) as Record<string, unknown>;
    assert.equal(tokenPayload.accessToken, 'short-lived-room-token');
    assert.equal(tokenPayload.roomName, expectedRoomName);
    assert.equal(JSON.stringify(tokenPayload).includes(secretKey), false);

    const tokenBody = meteredRequests[1]?.body;
    assert.equal(tokenBody?.roomName, expectedRoomName);
    assert.equal(tokenBody?.externalUserId, hostUid);
    assert.equal(tokenBody?.isAdmin, true);

    authenticatedUid = invitedUid;
    currentCall = firestoreCallDocument({
      callId,
      hostUid,
      invitedUids: [invitedUid],
      acceptedUids: [hostUid, invitedUid],
      status: 'active',
      roomName: expectedRoomName,
    });
    const guestResponse = await fetch(`${baseUrl}/api/metered-group-call/join-token`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ callId, displayName: 'Guest Test' }),
    });
    assert.equal(guestResponse.status, 200);
    const guestTokenBody = meteredRequests[2]?.body;
    assert.equal(guestTokenBody?.externalUserId, invitedUid);
    assert.equal(guestTokenBody?.isAdmin, false);
  } finally {
    await stopApiServer(server);
    restoreEnvironment(previous);
  }
});

test('Metered room creation rejects invitations beyond the eight-person cap', async () => {
  const previous = saveEnvironment();
  setTestEnvironment();
  const callId = 'call-over-limit';
  const hostUid = 'host-uid';
  let meteredRequestCount = 0;
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname !== 'firestore.googleapis.com') meteredRequestCount += 1;
    return new Response(
      JSON.stringify(
        firestoreCallDocument({
          callId,
          hostUid,
          invitedUids: Array.from({ length: 8 }, (_, index) => `guest-${index}`),
          acceptedUids: [hostUid],
          status: 'creating',
          roomName: '',
        })
      ),
      { status: 200 }
    );
  };
  const { server, baseUrl } = await startApiServer(
    fetchImpl,
    async () => ({ uid: hostUid })
  );

  try {
    const response = await fetch(`${baseUrl}/api/metered-group-call/create-room`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ callId }),
    });
    assert.equal(response.status, 409);
    assert.equal(meteredRequestCount, 0);
  } finally {
    await stopApiServer(server);
    restoreEnvironment(previous);
  }
});

test('Metered join token is denied to a Firebase user who was not invited', async () => {
  const previous = saveEnvironment();
  setTestEnvironment();
  const callId = 'call-private-1';
  const hostUid = 'host-uid';
  const roomName = createMeteredRoomName(
    callId,
    hostUid,
    process.env.METERED_SECRET_KEY ?? ''
  );
  let meteredRequestCount = 0;
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname !== 'firestore.googleapis.com') meteredRequestCount += 1;
    assert.equal(url.hostname, 'firestore.googleapis.com');
    return new Response(
      JSON.stringify(
        firestoreCallDocument({
          callId,
          hostUid,
          invitedUids: ['invited-uid'],
          acceptedUids: [hostUid],
          status: 'active',
          roomName,
        })
      ),
      { status: 200 }
    );
  };
  const { server, baseUrl } = await startApiServer(
    fetchImpl,
    async () => ({ uid: 'intruder-uid' })
  );

  try {
    const response = await fetch(`${baseUrl}/api/metered-group-call/join-token`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ callId }),
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: 'Akun ini belum diizinkan bergabung ke panggilan tersebut.',
    });
    assert.equal(meteredRequestCount, 0);
  } finally {
    await stopApiServer(server);
    restoreEnvironment(previous);
  }
});
