interface TurnCredentialsResponse {
  iceServers?: unknown;
  error?: unknown;
}

function isTurnIceServer(value: unknown): value is RTCIceServer {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const hasValidUrls =
    typeof record.urls === 'string' ||
    (Array.isArray(record.urls) && record.urls.every((url) => typeof url === 'string'));
  return (
    hasValidUrls &&
    typeof record.username === 'string' &&
    typeof record.credential === 'string'
  );
}

export async function fetchTurnIceServers(idToken: string): Promise<RTCIceServer[]> {
  const response = await fetch('/api/turn-credentials', {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
    cache: 'no-store',
  });

  let payload: TurnCredentialsResponse;
  try {
    payload = (await response.json()) as TurnCredentialsResponse;
  } catch {
    throw new Error('Server TURN mengembalikan respons yang tidak valid.');
  }

  if (!response.ok) {
    const message =
      typeof payload.error === 'string'
        ? payload.error
        : 'Kredensial TURN tidak dapat dimuat.';
    throw new Error(message);
  }

  if (
    !Array.isArray(payload.iceServers) ||
    payload.iceServers.length === 0 ||
    !payload.iceServers.every(isTurnIceServer)
  ) {
    throw new Error('Konfigurasi ICE dari server TURN tidak valid.');
  }
  return payload.iceServers;
}
