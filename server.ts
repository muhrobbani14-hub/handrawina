import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAkuAiApi } from './src/server/akuAiApi.ts';
import { createMeteredGroupCallApi } from './src/server/meteredGroupCallApi.ts';
import { createTurnCredentialsApi } from './src/server/turnCredentialsApi.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT ?? 3000);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));
  app.use(createAkuAiApi());
  app.use(createMeteredGroupCallApi());
  app.use(createTurnCredentialsApi());
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'Endpoint API tidak tersedia.' });
  });

  // ==========================================================================
  // FRONTEND SERVING (VITE MIDDLEWARE IN DEV, STATIC DIST IN PROD)
  // ==========================================================================
  const isProd = process.env.NODE_ENV === 'production';
  const distPath = path.resolve(__dirname, 'dist');

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Handrawina Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
