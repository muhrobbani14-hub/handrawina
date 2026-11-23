export interface AkuAiMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  isError?: boolean;
}

export interface AkuAiQuickPrompt {
  id: string;
  label: string;
  prompt: string;
}

export const AKU_AI_QUICK_PROMPTS: AkuAiQuickPrompt[] = [
  {
    id: 'draft-reply',
    label: 'Susun balasan profesional',
    prompt: 'Bantu saya menyusun balasan singkat dan sopan untuk mengonfirmasi jadwal rapat besok pukul 10.00 WIB.',
  },
  {
    id: 'draft-status',
    label: 'Ide teks Status 24 jam',
    prompt: 'Buatkan 3 ide kalimat singkat yang elegan untuk pembaruan Status hari ini tentang produktivitas kerja tim.',
  },
  {
    id: 'group-agenda',
    label: 'Format pengumuman grup',
    prompt: 'Buatkan format pengumuman komunitas yang rapi untuk agenda koordinasi mingguan dan poin tindak lanjut.',
  },
  {
    id: 'security-tips',
    label: 'Tips keamanan obrolan',
    prompt: 'Jelaskan secara ringkas 4 langkah praktis menjaga keamanan akun dan privasi obrolan sehari-hari.',
  },
];

export interface SanitizedHistoryTurn {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

const MAX_HISTORY_TURNS = 16;
const MAX_MESSAGE_CHARS = 4000;

export function sanitizeAkuAiHistory(rawHistory: unknown): SanitizedHistoryTurn[] {
  if (!Array.isArray(rawHistory)) return [];
  const turns: SanitizedHistoryTurn[] = [];
  for (const item of rawHistory) {
    if (!item || typeof item !== 'object') continue;
    const record = item as { role?: unknown; text?: unknown };
    if (record.role !== 'user' && record.role !== 'assistant') continue;
    if (typeof record.text !== 'string') continue;
    const cleaned = record.text.trim().slice(0, MAX_MESSAGE_CHARS);
    if (!cleaned) continue;
    turns.push({
      role: record.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: cleaned }],
    });
  }
  return turns.slice(-MAX_HISTORY_TURNS);
}

export function validateAkuAiRequest(body: unknown): {
  valid: boolean;
  error?: string;
  message: string;
  history: SanitizedHistoryTurn[];
  activeConversationName?: string;
} {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Payload permintaan Aku AI tidak valid.', message: '', history: [] };
  }
  const data = body as {
    message?: unknown;
    history?: unknown;
    activeConversationName?: unknown;
  };
  const message = typeof data.message === 'string' ? data.message.trim() : '';
  if (!message) {
    return { valid: false, error: 'Pesan untuk Aku AI wajib diisi.', message: '', history: [] };
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return {
      valid: false,
      error: `Pesan terlalu panjang (maksimal ${MAX_MESSAGE_CHARS} karakter).`,
      message: '',
      history: [],
    };
  }
  const activeConversationName =
    typeof data.activeConversationName === 'string' && data.activeConversationName.trim()
      ? data.activeConversationName.trim().slice(0, 80)
      : undefined;

  return {
    valid: true,
    message,
    history: sanitizeAkuAiHistory(data.history),
    activeConversationName,
  };
}

export function buildAkuAiSystemInstruction(params?: {
  userName?: string;
  activeConversationName?: string;
}): string {
  const userPart = params?.userName ? `Pengguna saat ini bernama ${params.userName}. ` : '';
  const convPart = params?.activeConversationName
    ? `Pengguna baru saja melihat percakapan "${params.activeConversationName}". `
    : '';
  return (
    'Kamu adalah Aku AI, asisten cerdas yang terintegrasi di dalam aplikasi perpesanan privat Handrawina. ' +
    userPart +
    convPart +
    'Jawablah dalam bahasa Indonesia yang natural, ramah, jelas, dan ringkas kecuali pengguna meminta bahasa lain. ' +
    'Bantu pengguna menyusun pesan, merangkum topik, membuat ide status atau pengumuman komunitas, serta menjawab pertanyaan umum dengan rapi.'
  );
}
