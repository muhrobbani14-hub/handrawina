import { createHmac } from 'node:crypto';
import express from 'express';
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from '../../firebase-applet-config.json';

interface TurnCredentialConfig {
  urls: string[];
  sharedSecret: string;
  ttlSeconds: number;
}

export function createTurnCredentials(
  uid: string,
  config: TurnCredentialConfig,
  nowSeconds = Math.floor(Date.now() / 1000)
): { username: string; credential: string; expiresAt: number } {
  const expiresAt = nowSeconds + config.ttlSeconds;
  const username = `${expiresAt}:${uid}`;
  const credential = createHmac('sha1', config.sharedSecret)
    .update(username)
    .digest('base64');
  return { username, credential, expiresAt };
}

function readTurnCredentialConfig(): TurnCredentialConfig | null {
  const urls = (process.env.TURN_URLS ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
  const sharedSecret = process.env.TURN_SHARED_SECRET?.trim();
  if (!urls.length || !sharedSecret) return null;
  if (urls.some((url) => !/^turns?:/i.test(url))) {
    throw new Error('TURN_URLS harus berisi alamat turn: atau turns:.');
  }

  const ttlSeconds = Number(process.env.TURN_CREDENTIAL_TTL_SECONDS ?? 3600);
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 300 || ttlSeconds > 86400) {
    throw new Error('TURN_CREDENTIAL_TTL_SECONDS harus antara 300 dan 86400.');
  }

  return { urls, sharedSecret, ttlSeconds };
}

function getFirebaseAuth() {
  const appName = 'turn-credentials';
  const existingApp = getApps().find((app) => app.name === appName);
  if (existingApp) return getAuth(existingApp);

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credential = serviceAccountJson
    ? cert(JSON.parse(serviceAccountJson))
    : applicationDefault();
  const app = initializeApp(
    {
      credential,
      projectId: firebaseConfig.projectId,
    },
    appName
  );
  return getAuth(app);
}

const INVALID_TOKEN_CODES = new Set([
  'auth/argument-error',
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/invalid-id-token',
  'auth/tenant-id-mismatch',
]);

export function createTurnCredentialsApi(): express.Router {
  const router = express.Router();

  router.get('/api/turn-credentials', async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    let config: TurnCredentialConfig | null;
    try {
      config = readTurnCredentialConfig();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Konfigurasi TURN tidak valid.';
      res.status(503).json({ error: message });
      return;
    }

    if (!config) {
      res.status(503).json({ error: 'Server TURN belum dikonfigurasi.' });
      return;
    }

    const authorization = req.header('authorization') ?? '';
    const match = /^Bearer\s+(\S+)$/i.exec(authorization);
    if (!match) {
      res.status(401).json({ error: 'Sesi Firebase diperlukan untuk meminta kredensial TURN.' });
      return;
    }

    try {
      const decodedToken = await getFirebaseAuth().verifyIdToken(match[1]);
      const credentials = createTurnCredentials(decodedToken.uid, config);
      res.json({
        iceServers: [
          {
            urls: config.urls,
            username: credentials.username,
            credential: credentials.credential,
          },
        ],
        expiresAt: credentials.expiresAt,
      });
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String(error.code)
          : '';
      if (INVALID_TOKEN_CODES.has(code)) {
        res.status(401).json({ error: 'Sesi Firebase tidak valid atau sudah kedaluwarsa.' });
        return;
      }

      console.error('TURN credential service failed:', error);
      res.status(503).json({ error: 'Layanan kredensial TURN belum siap.' });
    }
  });

  return router;
}
