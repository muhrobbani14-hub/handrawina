export interface VerifiedFirebaseUser {
  uid: string;
  name?: string;
}

export class FirebaseIdTokenVerificationError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

const INVALID_TOKEN_MESSAGES = new Set([
  'INVALID_ID_TOKEN',
  'TOKEN_EXPIRED',
  'USER_DISABLED',
  'USER_NOT_FOUND',
]);

export async function verifyFirebaseIdToken(
  idToken: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<VerifiedFirebaseUser> {
  if (!apiKey) {
    throw new FirebaseIdTokenVerificationError(
      'auth/configuration-error',
      'Firebase API key is not configured.'
    );
  }

  const response = await fetchImpl(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new FirebaseIdTokenVerificationError(
      'auth/internal-error',
      'Firebase Auth returned an unreadable response.'
    );
  }

  if (!response.ok) {
    const errorMessage =
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      payload.error &&
      typeof payload.error === 'object' &&
      'message' in payload.error &&
      typeof payload.error.message === 'string'
        ? payload.error.message
        : '';

    if (INVALID_TOKEN_MESSAGES.has(errorMessage)) {
      throw new FirebaseIdTokenVerificationError(
        'auth/invalid-id-token',
        'Firebase ID token is invalid or expired.'
      );
    }

    throw new FirebaseIdTokenVerificationError(
      'auth/internal-error',
      'Firebase Auth could not verify the ID token.'
    );
  }

  const user =
    payload &&
    typeof payload === 'object' &&
    'users' in payload &&
    Array.isArray(payload.users)
      ? payload.users[0]
      : undefined;
  if (
    !user ||
    typeof user !== 'object' ||
    !('localId' in user) ||
    typeof user.localId !== 'string' ||
    !user.localId
  ) {
    throw new FirebaseIdTokenVerificationError(
      'auth/internal-error',
      'Firebase Auth returned invalid account data.'
    );
  }

  return {
    uid: user.localId,
    ...('displayName' in user && typeof user.displayName === 'string'
      ? { name: user.displayName }
      : {}),
  };
}
