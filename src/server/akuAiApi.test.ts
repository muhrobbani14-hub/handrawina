import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { createAkuAiApi } from './akuAiApi.ts';

test('Aku AI rejects an empty message before contacting the model service', async () => {
  const app = express();
  app.use(express.json());
  app.use(createAkuAiApi());
  const server = app.listen(0);
  await once(server, 'listening');

  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    const response = await fetch(`http://127.0.0.1:${address.port}/api/aku-ai/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: '  ' }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'Pesan untuk Aku AI wajib diisi.' });
  } finally {
    server.close();
    await once(server, 'close');
  }
});
