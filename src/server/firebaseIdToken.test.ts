import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FirebaseIdTokenVerificationError,
  verifyFirebaseIdToken,
} from './firebaseIdToken.ts';

test('Firebase ID tokens are verified through the Auth lookup endpoint', async () => {
  const user = await verifyFirebaseIdToken(
    'test-id-token',
    'test-api-key',
    async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.hostname, 'identitytoolkit.googleapis.com');
      assert.equal(url.pathname, '/v1/accounts:lookup');
      assert.equal(url.searchParams.get('key'), 'test-api-key');
      assert.equal(init?.method, 'POST');
      assert.deepEqual(JSON.parse(String(init?.body)), { idToken: 'test-id-token' });
      return Response.json({
        users: [{ localId: 'firebase-user', displayName: 'Test User' }],
      });
    }
  );

  assert.deepEqual(user, { uid: 'firebase-user', name: 'Test User' });
});

test('invalid Firebase ID tokens are distinguished from Auth service failures', async () => {
  await assert.rejects(
    verifyFirebaseIdToken(
      'expired-token',
      'test-api-key',
      async () => Response.json(
        { error: { message: 'TOKEN_EXPIRED' } },
        { status: 400 }
      )
    ),
    (error: unknown) =>
      error instanceof FirebaseIdTokenVerificationError &&
      error.code === 'auth/invalid-id-token'
  );

  await assert.rejects(
    verifyFirebaseIdToken(
      'test-token',
      'test-api-key',
      async () => Response.json(
        { error: { message: 'API_KEY_SERVICE_BLOCKED' } },
        { status: 403 }
      )
    ),
    (error: unknown) =>
      error instanceof FirebaseIdTokenVerificationError &&
      error.code === 'auth/internal-error'
  );
});
