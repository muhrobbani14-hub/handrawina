import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import express from 'express';
import {
  buildAkuAiSystemInstruction,
  validateAkuAiRequest,
} from '../utils/akuAiHelpers.ts';

function getAkuAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Kunci API layanan Aku AI (GEMINI_API_KEY) belum tersedia pada pengaturan server.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function createAkuAiApi(): express.Router {
  const router = express.Router();

  router.post('/api/aku-ai/chat', async (req, res) => {
    const validated = validateAkuAiRequest(req.body);
    if (!validated.valid) {
      res.status(400).json({ error: validated.error ?? 'Permintaan Aku AI tidak valid.' });
      return;
    }

    try {
      const ai = getAkuAiClient();
      const contents = [
        ...validated.history,
        { role: 'user' as const, parts: [{ text: validated.message }] },
      ];
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents,
        config: {
          systemInstruction: buildAkuAiSystemInstruction({
            activeConversationName: validated.activeConversationName,
          }),
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
        },
      });
      const reply = (response.text ?? '').trim();
      if (!reply) {
        res.status(502).json({
          error: 'Aku AI tidak menghasilkan teks balasan. Silakan coba ulangi pertanyaan Anda.',
        });
        return;
      }
      res.json({ reply });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Terjadi kesalahan saat menghubungi layanan Aku AI.';
      res.status(message.includes('GEMINI_API_KEY') ? 503 : 502).json({ error: message });
    }
  });

  return router;
}
