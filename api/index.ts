import express from 'express';
import { createAkuAiApi } from '../src/server/akuAiApi.ts';
import { createMeteredGroupCallApi } from '../src/server/meteredGroupCallApi.ts';
import { createTurnCredentialsApi } from '../src/server/turnCredentialsApi.ts';

const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(createAkuAiApi());
app.use(createMeteredGroupCallApi());
app.use(createTurnCredentialsApi());

export default app;
