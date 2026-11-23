import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { createTurnCredentials, createTurnCredentialsApi } from './turnCredentialsApi.ts';

test('TURN credentials use Coturn REST HMAC and expire at the configured TTL', () => {
  const config = {
    urls: ['turn:relay.example.test:3478'],
    sharedSecret: 'server-only-test-secret',
    ttlSeconds: 900,
  };
  const result = createTurnCredentials('firebase-user-1', config, 1_800_000_000);
  const expectedUsername = '1800000900:firebase-user-1';
  const expectedCredential = createHmac('sha1', config.sharedSecret)
    .update(expectedUsername)
    .digest('base64');

  assert.equal(result.username, expectedUsername);
  assert.equal(result.credential, expectedCredential);
  assert.equal(result.expiresAt, 1_800_000_900);
});

test('TURN credentials are not exposed without server-side TURN configuration', async () => {
  const previousUrls = process.env.TURN_URLS;
  const previousSecret = process.env.TURN_SHARED_SECRET;
  delete process.env.TURN_URLS;
  delete process.env.TURN_SHARED_SECRET;

  const app = express();
  app.use(createTurnCredentialsApi());
  const server = app.listen(0);
  await once(server, 'listening');

  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/turn-credentials`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'Server TURN belum dikonfigurasi.' });
  } finally {
    server.close();
    await once(server, 'close');
    if (previousUrls === undefined) delete process.env.TURN_URLS;
    else process.env.TURN_URLS = previousUrls;
    if (previousSecret === undefined) delete process.env.TURN_SHARED_SECRET;
    else process.env.TURN_SHARED_SECRET = previousSecret;
  }
});

test('TURN credentials require a Firebase bearer token', async () => {
  const previousUrls = process.env.TURN_URLS;
  const previousSecret = process.env.TURN_SHARED_SECRET;
  process.env.TURN_URLS = 'turn:relay.example.test:3478';
  process.env.TURN_SHARED_SECRET = 'server-only-test-secret';

  const app = express();
  app.use(createTurnCredentialsApi());
  const server = app.listen(0);
  await once(server, 'listening');

  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/turn-credentials`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: 'Sesi Firebase diperlukan untuk meminta kredensial TURN.',
    });
  } finally {
    server.close();
    await once(server, 'close');
    if (previousUrls === undefined) delete process.env.TURN_URLS;
    else process.env.TURN_URLS = previousUrls;
    if (previousSecret === undefined) delete process.env.TURN_SHARED_SECRET;
    else process.env.TURN_SHARED_SECRET = previousSecret;
  }
});
